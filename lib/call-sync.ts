import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyCall, INSIGHT_VERSION, type CallInsight } from '@/lib/call-insights'
import { isMissingColumn } from '@/lib/db-errors'
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

const SILENT_CALL: CallInsight = {
  summary: 'Den som ringde lade på utan att säga något.',
  contactRequest: 'none',
  contactNote: null,
  callerName: null,
}

// Which analysis the schema can hold, newest first. The code is deployed ahead
// of its migrations, so each step down is what an older database can store:
//   'versioned'  028 — everything, re-analysing rows below INSIGHT_VERSION
//   'labelled'   027 — summary + contact request, rows with no label yet
//   'summary'    neither — summary only
type EnrichMode = 'versioned' | 'labelled' | 'summary'

const NEEDS_ANALYSIS = `insight_version.is.null,insight_version.lt.${INSIGHT_VERSION}`

/** The subset of GET /v1/convai/conversations/{id} this file reads. */
interface ElevenLabsConversation {
  status?: 'initiated' | 'in-progress' | 'processing' | 'done' | 'failed' | string
  transcript?: { role?: string; message?: string | null }[] | null
  metadata?: { call_duration_secs?: number | null } | null
  analysis?: { sentiment_analysis?: { overall_label?: string | null } | null } | null
}

interface PendingRow {
  id: string
  error_message: string | null
  created_at: string
}

interface CompletedRow {
  id: string
  transcript: string
  summary: string | null
}

export function conversationIdOf(errorMessage: string | null | undefined): string | null {
  return errorMessage?.match(CONVERSATION_ID)?.[1] ?? null
}

export async function syncAgentCalls(
  supabase: SupabaseClient,
  agent: { id: string; businessName: string },
): Promise<void> {
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY
  if (elevenLabsKey) await finalize(supabase, agent.id, elevenLabsKey)
  await enrich(supabase, agent.id, agent.businessName)
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

  // Only ever moves a row out of in_progress: if a parallel run got there
  // first, this matches nothing.
  const settle = async (patch: Record<string, unknown>) => {
    const { error } = await supabase
      .from('call_logs')
      .update(patch)
      .eq('id', row.id)
      .eq('status', 'in_progress')
    if (error) console.error(`[call-sync] Kunde inte uppdatera samtal ${conversationId}: ${error.message}`)
  }

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
    await settle({
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
      await settle({
        status: 'completed',
        transcript: formatTranscript(turns),
        duration_sec: typeof seconds === 'number' ? Math.round(seconds) : null,
        sentiment: conversation.analysis?.sentiment_analysis?.overall_label ?? null,
      })
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

async function enrich(supabase: SupabaseClient, agentId: string, businessName: string): Promise<void> {
  const base = () =>
    supabase
      .from('call_logs')
      .select('id, transcript, summary')
      .eq('agent_id', agentId)
      .eq('status', 'completed')
      .not('transcript', 'is', null)
      .order('created_at', { ascending: false })
      .limit(ENRICH_PER_RUN)

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
    return
  }

  await Promise.allSettled(
    ((data ?? []) as CompletedRow[]).map(async row => {
      const turns = parseTranscript(row.transcript)
      const insight = callerSpoke(turns) ? await classifyCall(turns, businessName) : SILENT_CALL
      if (!insight) return

      // A summary that arrived with the row (e.g. from the inbound webhook), or
      // one written by an earlier analysis, is kept rather than churned.
      const summary = row.summary ?? insight.summary

      // Each write is conditional on the row still needing it, so an
      // overlapping page load that got there first is not overwritten.
      const table = supabase.from('call_logs')
      const { error: updateError } =
        mode === 'versioned'
          ? await table
              .update({
                summary,
                contact_request: insight.contactRequest,
                contact_note: insight.contactNote,
                caller_name: insight.callerName,
                insight_version: INSIGHT_VERSION,
              })
              .eq('id', row.id)
              .or(NEEDS_ANALYSIS)
          : mode === 'labelled'
            ? await table
                .update({ summary, contact_request: insight.contactRequest, contact_note: insight.contactNote })
                .eq('id', row.id)
                .is('contact_request', null)
            : await table
                .update({ summary: insight.summary })
                .eq('id', row.id)
                .is('summary', null)

      if (updateError) console.error(`[call-sync] Kunde inte spara sammanfattning: ${updateError.message}`)
    }),
  )
}
