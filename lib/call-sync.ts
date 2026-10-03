import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyCall, INSIGHT_VERSION, type CallInsight } from '@/lib/call-insights'
import { isMissingColumn } from '@/lib/db-errors'
import { notifyCompletedCall, type NotifyAgent } from '@/lib/call-notify'
import { callerSpoke, formatTranscript, parseTranscript, type Turn } from '@/lib/call-transcript'

// Completes call_logs rows for real inbound calls, from ElevenLabs' own record.
//
// /api/twilio/incoming-call writes one row per call at the moment it hands the
// call to ElevenLabs: status 'in_progress', the two numbers, and the ElevenLabs
// conversation id inside error_message ("… · conversation_id=conv_…"). Nothing
// ever came back to finish that row. Checked on 2026-09-29: every real call in
// the table — all ten of Bentus AB's — still said in_progress, with no
// transcript, summary or duration, while ElevenLabs held the full conversations.
//
// syncAgentCalls() closes that gap for one agent:
//   1. finalize — in_progress rows with a conversation id are looked up at
//      ElevenLabs. A finished conversation fills in transcript, duration and
//      sentiment and the row becomes 'completed'. One that never connected
//      becomes 'error' with a readable reason, which is how the dashboard's
//      Calls tab and AI Fix already present failed calls.
//   2. enrich   — completed rows not yet analysed, or analysed by an older
//      version, get a Swedish summary, a contact-request label and the caller's
//      name from Claude (lib/call-insights.ts).
//
// It runs from the public calls route, so it is bounded — a few rows per step —
// and every row is processed once: a finished row is never fetched again, a
// classified row is never sent to Claude again. Each write is conditional on the
// row still being in the state it was read in, so two overlapping page loads
// cannot overwrite each other; at worst both ask Claude about the same call.
//
// Deliberately NOT written: call_logs.cost. ElevenLabs reports cost in its own
// credits (and cost_fiat in USD), while the dashboard sums that column and shows
// it as kronor.

const CONVERSATION_ID = /conversation_id=(conv_[A-Za-z0-9]+)/

/** A conversation still 'initiated' this long after the call arrived never connected. */
export const NEVER_CONNECTED_AFTER_MS = 60 * 60 * 1000

const FINALIZE_PER_RUN = 8
const ENRICH_PER_RUN = 3

/**
 * Agenten som synkas. share id och notisadress bärs med hit bara för att en
 * färdiganalyserad rad ska kunna mejlas vidare (lib/call-notify.ts) — inget av
 * det lämnar servern.
 */
export interface SyncAgent extends NotifyAgent {
  businessName: string
}

const SILENT_CALL: CallInsight = {
  summary: 'Den som ringde lade på utan att säga något.',
  contactRequest: 'none',
  contactNote: null,
  callerName: null,
  aiResolved: null,   // ingenting sades, alltså ingenting att lösa
  usage: null,        // ingen modell anropades
}

// Which analysis the schema can hold, newest first. The code is deployed ahead
// of its migrations, so each step down is what an older database can store:
//   'versioned'  028 — everything, re-analysing rows below INSIGHT_VERSION
//   'labelled'   027 — summary + contact request, rows with no label yet
//   'summary'    neither — summary only
export type EnrichMode = 'versioned' | 'labelled' | 'summary'

const NEEDS_ANALYSIS = `insight_version.is.null,insight_version.lt.${INSIGHT_VERSION}`

/**
 * Delen av en ElevenLabs-konversation som vi läser.
 *
 * Samma modell kommer från två håll och tolkas därför på ett enda ställe:
 * GET /v1/convai/conversations/{id} (sidladdningssynken nedan) och
 * post-call-webhookens `data` (lib/call-ingest.ts). ElevenLabs kallar den
 * ConversationHistoryCommonModel i båda fallen — jämfört fält för fält mot ett
 * riktigt samtal 2026-10-02.
 */
export interface ElevenLabsConversation {
  status?: 'initiated' | 'in-progress' | 'processing' | 'done' | 'failed' | string
  transcript?: { role?: string; message?: string | null }[] | null
  metadata?: {
    call_duration_secs?: number | null
    /** USD, färdigräknat. Finns i både API-svaret och webhooken. */
    cost_fiat?: number | null
    /**
     * Twilios Call SID. Värdefull: lib/cost-sync.ts måste annars parkoppla
     * samtalet mot Twilios lista på nummer, starttid ±30 s och längd ±3 s,
     * eftersom SID:t aldrig sparades när samtalet kopplades.
     */
    phone_call?: { call_sid?: string | null; type?: string | null } | null
  } | null
  analysis?: { sentiment_analysis?: { overall_label?: string | null } | null } | null
}

export interface PendingRow {
  id: string
  error_message: string | null
  created_at: string
}

export interface CompletedRow {
  id: string
  transcript: string
  summary: string | null
}

export function conversationIdOf(errorMessage: string | null | undefined): string | null {
  return errorMessage?.match(CONVERSATION_ID)?.[1] ?? null
}

export async function syncAgentCalls(supabase: SupabaseClient, agent: SyncAgent): Promise<void> {
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY
  if (elevenLabsKey) await finalize(supabase, agent.id, elevenLabsKey)
  await enrich(supabase, agent)
}

/** Calls ElevenLabs is plausibly still working on — shown as "bearbetas" on the page. */
export async function countProcessingCalls(supabase: SupabaseClient, agentId: string): Promise<number> {
  const since = new Date(Date.now() - NEVER_CONNECTED_AFTER_MS).toISOString()
  const { count } = await supabase
    .from('call_logs')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
    .eq('status', 'in_progress')
    .like('error_message', '%conversation_id=conv_%')
    .gte('created_at', since)
  return count ?? 0
}

// ── 1. Finalize ──────────────────────────────────────────────────────────────

async function finalize(supabase: SupabaseClient, agentId: string, apiKey: string): Promise<void> {
  const { data, error } = await supabase
    .from('call_logs')
    .select('id, error_message, created_at')
    .eq('agent_id', agentId)
    .eq('status', 'in_progress')
    .like('error_message', '%conversation_id=conv_%')
    .order('created_at', { ascending: false })
    .limit(FINALIZE_PER_RUN)

  if (error) {
    console.error(`[call-sync] Kunde inte läsa pågående samtal: ${error.message}`)
    return
  }

  await Promise.allSettled(
    ((data ?? []) as PendingRow[]).map(row => finalizeOne(supabase, row, apiKey)),
  )
}

async function finalizeOne(supabase: SupabaseClient, row: PendingRow, apiKey: string): Promise<void> {
  const conversationId = conversationIdOf(row.error_message)
  if (!conversationId) return

  let res: Response
  try {
    res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
      { headers: { 'xi-api-key': apiKey }, signal: AbortSignal.timeout(8_000), cache: 'no-store' },
    )
  } catch (err) {
    console.error(`[call-sync] ElevenLabs nåddes inte för ${conversationId}:`, err)
    return
  }

  if (res.status === 404) {
    await settleRow(supabase, row.id, conversationId, {
      status: 'error',
      error_message: `Samtalet finns inte hos ElevenLabs (conversation_id=${conversationId})`,
    })
    return
  }
  if (!res.ok) {
    // 429 / 5xx: leave the row as it is and try again on the next page load.
    console.error(`[call-sync] ElevenLabs svarade ${res.status} för ${conversationId}`)
    return
  }

  const conversation = (await res.json().catch(() => null)) as ElevenLabsConversation | null
  if (!conversation) return

  await applyConversation(supabase, row, conversation)
}

/**
 * Flyttar en rad ut ur in_progress — aldrig tillbaka in.
 *
 * Villkoret `status = 'in_progress'` är det som gör skrivningen idempotent:
 * hann webhooken och en sidladdning fram samtidigt matchar den andra ingenting
 * i stället för att skriva över. Post-call-webhooken kan dessutom levereras om
 * med identisk body (upp till 5 försök), och det här är vad som gör ett
 * omförsök ofarligt.
 */
export async function settleRow(
  supabase: SupabaseClient,
  rowId: string,
  conversationId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('call_logs')
    .update(patch)
    .eq('id', rowId)
    .eq('status', 'in_progress')
  if (error) console.error(`[call-sync] Kunde inte uppdatera samtal ${conversationId}: ${error.message}`)
}

/**
 * Tolkar en färdig konversation och skriver raden klar.
 *
 * Delad mellan sidladdningssynken (som precis hämtat konversationen) och
 * post-call-webhooken (som fick den skickad till sig). Samma tolkning på båda
 * vägarna, så ett samtal ser likadant ut i BOS oavsett vem som kom först.
 */
export async function applyConversation(
  supabase: SupabaseClient,
  row: PendingRow,
  conversation: ElevenLabsConversation,
): Promise<void> {
  const conversationId = conversationIdOf(row.error_message) ?? 'okänt'
  const settle = (patch: Record<string, unknown>) =>
    settleRow(supabase, row.id, conversationId, patch)

  const turns: Turn[] = (conversation.transcript ?? []).flatMap(t => {
    const text = (t.message ?? '').trim()
    return text ? [{ speaker: t.role === 'user' ? 'caller' : 'receptionist', text } as Turn] : []
  })

  switch (conversation.status) {
    case 'done':
    case 'failed': {
      if (turns.length === 0) {
        await settle({
          status: 'error',
          error_message:
            conversation.status === 'failed'
              ? `ElevenLabs markerade samtalet som misslyckat (conversation_id=${conversationId})`
              : `Samtalet avslutades utan att något sades (conversation_id=${conversationId})`,
        })
        return
      }

      const seconds = conversation.metadata?.call_duration_secs
      const done = {
        status: 'completed',
        transcript: formatTranscript(turns),
        duration_sec: typeof seconds === 'number' ? Math.round(seconds) : null,
        sentiment: conversation.analysis?.sentiment_analysis?.overall_label ?? null,
      }

      // SID och ElevenLabs-kostnad ligger i konversationen och är gratis att
      // ta med här. Kostnadssynken (031) slipper då gissa vilket Twilio-samtal
      // raden hör till. Saknas kolumnerna skrivs raden klar utan dem.
      // Bara Twilio-samtal: kolumnen heter twilio_call_sid och ett SIP-samtals
      // id hör inte dit. 46elks-samtal får ingen Twilio-kostnad, vilket är
      // korrekt — den kostnaden finns på 46elks faktura, inte hos Twilio.
      const phoneCall = conversation.metadata?.phone_call
      const sid = phoneCall?.type === 'twilio' ? (phoneCall.call_sid ?? null) : null
      const costUsd = conversation.metadata?.cost_fiat
      const extra: Record<string, unknown> = {}
      if (sid) extra.twilio_call_sid = sid
      if (typeof costUsd === 'number') extra.cost_elevenlabs_usd = costUsd

      if (Object.keys(extra).length > 0) {
        const { error } = await supabase
          .from('call_logs')
          .update({ ...done, ...extra })
          .eq('id', row.id)
          .eq('status', 'in_progress')
        if (!error) return
        if (!isMissingColumn(error)) {
          console.error(`[call-sync] Kunde inte uppdatera samtal ${conversationId}: ${error.message}`)
          return
        }
      }

      await settle(done)
      return
    }

    case 'initiated': {
      // What the calls placed before the register-call fix look like: ElevenLabs
      // opened a conversation that never received audio, and never will.
      const age = Date.now() - new Date(row.created_at).getTime()
      if (age > NEVER_CONNECTED_AFTER_MS) {
        await settle({
          status: 'error',
          error_message: `Samtalet kopplades aldrig upp hos ElevenLabs (conversation_id=${conversationId})`,
        })
      }
      return
    }

    default:
      // in-progress / processing: the call is live or its analysis is running.
      return
  }
}

// ── 2. Enrich ────────────────────────────────────────────────────────────────

async function enrich(supabase: SupabaseClient, agent: SyncAgent): Promise<void> {
  const found = await selectNeedingAnalysis(supabase, agent.id, null)
  if (!found) return

  await Promise.allSettled(found.rows.map(row => enrichRow(supabase, agent, row, found.mode)))
}

/**
 * Samtalen som saknar analys, och vilken nivå av schemat databasen klarar.
 *
 * `rowId` begränsar till ett enda samtal — så analyserar post-call-webhooken
 * just det samtal som nyss tog slut (lib/call-ingest.ts), utan att
 * nivådetekteringen behöver finnas på två ställen. Utan rowId tas de nyaste.
 */
async function selectNeedingAnalysis(
  supabase: SupabaseClient,
  agentId: string,
  rowId: string | null,
): Promise<{ rows: CompletedRow[]; mode: EnrichMode } | null> {
  const base = () => {
    const q = supabase
      .from('call_logs')
      .select('id, transcript, summary')
      .eq('agent_id', agentId)
      .eq('status', 'completed')
      .not('transcript', 'is', null)
    // agent_id ovan är det som avgränsar: webhooken kan inte få oss att
    // analysera ett samtal som hör till en annan agent, hur payloaden än ser ut.
    return rowId ? q.eq('id', rowId) : q.order('created_at', { ascending: false }).limit(ENRICH_PER_RUN)
  }

  let mode: EnrichMode = 'versioned'
  let { data, error } = await base().or(NEEDS_ANALYSIS)

  if (isMissingColumn(error)) {
    mode = 'labelled'
    ;({ data, error } = await base().is('contact_request', null))
  }
  if (mode === 'labelled' && isMissingColumn(error)) {
    mode = 'summary'
    ;({ data, error } = await base().is('summary', null))
  }

  if (error) {
    console.error(`[call-sync] Kunde inte läsa samtal att sammanfatta: ${error.message}`)
    return null
  }

  return { rows: (data ?? []) as unknown as CompletedRow[], mode }
}

/**
 * Analyserar ett enda samtal, om det fortfarande behöver det.
 *
 * Webhookens väg in. Finns inget att göra — raden är redan analyserad, eller
 * hör till en annan agent — görs ingenting. Det är det som gör en omlevererad
 * webhook ofarlig.
 */
export async function enrichCall(
  supabase: SupabaseClient,
  agent: SyncAgent,
  rowId: string,
): Promise<void> {
  const found = await selectNeedingAnalysis(supabase, agent.id, rowId)
  if (!found || found.rows.length === 0) return
  await enrichRow(supabase, agent, found.rows[0], found.mode)
}

/**
 * Sammanfattar, klassificerar och notiserar ett enda färdigt samtal.
 *
 * Bruten ur enrich() för att post-call-webhooken ska kunna göra exakt samma
 * sak för ett samtal direkt när det är slut (lib/call-ingest.ts), i stället
 * för att vänta på att någon öppnar BOS-länken.
 */
export async function enrichRow(
  supabase: SupabaseClient,
  agent: SyncAgent,
  row: CompletedRow,
  mode: EnrichMode,
): Promise<void> {
  const turns = parseTranscript(row.transcript)
  const insight = callerSpoke(turns) ? await classifyCall(turns, agent.businessName) : SILENT_CALL
  if (!insight) return

  // A summary that arrived with the row (e.g. from the inbound webhook), or
  // one written by an earlier analysis, is kept rather than churned.
  const summary = row.summary ?? insight.summary

  // Each write is conditional on the row still needing it, so an
  // overlapping page load that got there first is not overwritten.
  const table = () => supabase.from('call_logs')
  const analysis = {
    summary,
    contact_request: insight.contactRequest,
    contact_note: insight.contactNote,
    caller_name: insight.callerName,
    insight_version: INSIGHT_VERSION,
  }
  // Tokens loggas här eftersom Anthropic inte går att fråga i efterhand
  // (031). Saknas kolumnerna skrivs analysen ändå — utan dem.
  const withTokens = {
    ...analysis,
    anthropic_input_tokens: insight.usage?.inputTokens ?? null,
    anthropic_output_tokens: insight.usage?.outputTokens ?? null,
  }
  // Lösningsgraden (032) ligger ytterst: nyast kolumn, först att falla bort.
  const full = { ...withTokens, ai_resolved: insight.aiResolved }

  const writeVersioned = async () => {
    for (const patch of [full, withTokens, analysis]) {
      const res = await table().update(patch).eq('id', row.id).or(NEEDS_ANALYSIS)
      if (!isMissingColumn(res.error)) return res
    }
    return table().update(analysis).eq('id', row.id).or(NEEDS_ANALYSIS)
  }

  const { error: updateError } =
    mode === 'versioned'
      ? await writeVersioned()
      : mode === 'labelled'
        ? await table()
            .update({ summary, contact_request: insight.contactRequest, contact_note: insight.contactNote })
            .eq('id', row.id)
            .is('contact_request', null)
        : await table()
            .update({ summary: insight.summary })
            .eq('id', row.id)
            .is('summary', null)

  if (updateError) {
    console.error(`[call-sync] Kunde inte spara sammanfattning: ${updateError.message}`)
    return
  }

  // Analysen är klar och sparad — det är här klienten ska få veta av sig.
  // Bara i 'versioned', som är det enda läget där sammanfattning, namn och
  // förfrågan faktiskt finns att mejla (028 och framåt). Notisen får aldrig
  // fälla synken, så den är isolerad.
  if (mode === 'versioned') {
    try {
      await notifyCompletedCall(supabase, agent, row.id)
    } catch (err) {
      console.error('[call-sync] Notis kastade:', err)
    }
  }
}
