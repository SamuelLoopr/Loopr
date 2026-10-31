import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingColumn, isMissingTable } from '@/lib/db-errors'

// Gallring av personuppgifter i call_logs enligt lagringstiden per kund.
//
// ── VAD SOM RADERAS OCH VAD SOM BEVARAS ─────────────────────────────────────
// Raden tas aldrig bort. Det är dess personuppgifter som töms, medan
// aggregaten står kvar:
//
//   TÖMS   transcript, error_message                     (råtranskript-perioden)
//          summary, contact_note, client_note,
//          caller_name, from_number, to_number,          (sammanfattningsperioden)
//          callback_number, sms_id
//
//   RADERAS  call_sms_replies — sms-svar på bekräftelsen   (sammanfattningsperioden)
//            (043). Hela raden är personuppgifter: numret och kundens text.
//            elks_inbound_calls — 46elks samtals-id med       (sammanfattningsperioden)
//            uppringarens nummer (045), för påläggningen.
//
//   KVAR   duration_sec, cost_twilio_usd, cost_elevenlabs_usd,
//          anthropic_input_tokens, anthropic_output_tokens, ai_resolved,
//          contact_request, provider, status, sentiment, created_at,
//          insight_version, twilio_call_sid, cost_synced_at, sms_sent_at
//
// Det gör att /aktiva-klienter, MRR och lösningsgraden fortsätter stämma bakåt
// i tiden. Hade raderna raderats hade kostnadshistoriken blivit fel, och den
// behövs för bokföringen.
//
// Telefonnumren hör till sammanfattningsperioden och inte till
// transkriptperioden. De är det mest identifierande vi har, men också det enda
// som gör en återuppringning möjlig — alltså samma syfte som sammanfattningen
// och samma livslängd.
//
// ── FAKTUROR RÖRS ALDRIG ────────────────────────────────────────────────────
// Det finns ingen kod i den här filen som skriver till invoices.
// Bokföringslagen 7 kap. 2 §: räkenskapsinformation ska bevaras till och med
// det sjunde året efter utgången av det kalenderår då räkenskapsåret
// avslutades.
//
// ── AVSTÄNGT SOM STANDARD ───────────────────────────────────────────────────
// retention_settings.enabled är false i migration 036, och cron-routen kör i
// torrkörning om den inte uttryckligen får annat. Ingenting raderas förrän
// operatören slår på det.

/** Kolumner som töms av råtranskript-perioden. */
const TRANSCRIPT_COLUMNS = ['transcript', 'error_message'] as const

/** Kolumner som töms av sammanfattningsperioden. */
const SUMMARY_COLUMNS = [
  'summary', 'contact_note', 'client_note', 'caller_name', 'from_number', 'to_number', 'callback_number',
  // sms_id pekar ut sms:et hos 46elks, där mottagarens nummer finns kvar.
  'sms_id',
] as const

export interface RetentionSetting {
  user_id: string
  agent_id: string
  transcript_days: number
  summary_days: number
  enabled: boolean
  delete_at_elevenlabs: boolean
}

export interface AgentOutcome {
  /** Vilken operatör kunden hör till. Används för att dela upp körningsloggen. */
  userId: string
  agentId: string
  agentName?: string
  enabled: boolean
  transcriptDays: number
  summaryDays: number
  /** Rader vars transkript är äldre än perioden och inte redan tömt. */
  transcriptsDue: number
  summariesDue: number
  transcriptsCleared: number
  summariesCleared: number
  /** Sms-svar (call_sms_replies, 043) äldre än sammanfattningsperioden. */
  smsRepliesDue: number
  smsRepliesDeleted: number
  /** 46elks samtals-id (elks_inbound_calls, 045) äldre än sammanfattningsperioden. */
  inboundCallsDue: number
  inboundCallsDeleted: number
  elevenLabsDeleted: number
  errors: string[]
}

export interface RetentionResult {
  dryRun: boolean
  scanned: number
  transcriptsCleared: number
  summariesCleared: number
  smsRepliesDeleted: number
  elevenLabsDeleted: number
  errors: number
  agents: AgentOutcome[]
  /** Vilka användare som hade inställningar, så körningen kan loggas per ägare. */
  userIds: string[]
  /** Satt när migration 036 inte är körd — då görs ingenting alls. */
  unsupported?: boolean
  /** Rader i public_rate_limit äldre än ett dygn som rensades (050). */
  rateLimitRowsDeleted?: number
}

const cutoff = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

/**
 * Går igenom varje kunds samtal och tömmer det som passerat lagringstiden.
 *
 * `dryRun` räknar utan att skriva. Det är standardläget, och det som
 * cron-jobbet använder tills operatören slår på skarp körning — en
 * gallringsrutin som går skarpt vid första driftsättningen är en
 * dataförlustincident som väntar på att hända.
 */
export async function runRetention(
  supabase: SupabaseClient,
  { dryRun = true, elevenLabsKey }: { dryRun?: boolean; elevenLabsKey?: string } = {},
): Promise<RetentionResult> {
  const empty: RetentionResult = {
    dryRun, scanned: 0, transcriptsCleared: 0, summariesCleared: 0, smsRepliesDeleted: 0,
    elevenLabsDeleted: 0, errors: 0, agents: [], userIds: [],
  }

  const { data: settings, error } = await supabase
    .from('retention_settings')
    .select('user_id, agent_id, transcript_days, summary_days, enabled, delete_at_elevenlabs')
  if (error) {
    if (isMissingTable(error)) return { ...empty, unsupported: true }
    console.error(`[retention] Kunde inte läsa inställningar: ${error.message}`)
    return { ...empty, errors: 1 }
  }
  if (!settings || settings.length === 0) return { ...empty, rateLimitRowsDeleted: await pruneRateLimits(supabase) }

  const result: RetentionResult = { ...empty, agents: [] }

  for (const s of settings as RetentionSetting[]) {
    const out: AgentOutcome = {
      userId: s.user_id, agentId: s.agent_id, enabled: s.enabled,
      transcriptDays: s.transcript_days, summaryDays: s.summary_days,
      transcriptsDue: 0, summariesDue: 0,
      transcriptsCleared: 0, summariesCleared: 0, smsRepliesDue: 0, smsRepliesDeleted: 0,
      inboundCallsDue: 0, inboundCallsDeleted: 0,
      elevenLabsDeleted: 0, errors: [],
    }

    // Vad som ÄR förfallet räknas alltid, även när gallringen är avstängd —
    // det är hela poängen med torrkörningen: att se vad som skulle hända.
    const due = async (cols: readonly string[], days: number) => {
      const { data, error: e } = await supabase
        .from('call_logs')
        .select('id, error_message')
        .eq('agent_id', s.agent_id)
        .lt('created_at', cutoff(days))
        .or(cols.map(c => `${c}.not.is.null`).join(','))
        .limit(500)
      if (e) { out.errors.push(e.message); return [] }
      return data ?? []
    }

    const tRows = await due(TRANSCRIPT_COLUMNS, s.transcript_days)
    const sRows = await due(SUMMARY_COLUMNS, s.summary_days)
    out.transcriptsDue = tRows.length
    out.summariesDue = sRows.length

    // Sms-svaren raderas helt, med samma period som sammanfattningen. Saknas
    // tabellen (043 inte körd) finns inget att gallra.
    const { data: replyRows, error: replyError } = await supabase
      .from('call_sms_replies')
      .select('id')
      .eq('agent_id', s.agent_id)
      .lt('received_at', cutoff(s.summary_days))
      .limit(500)
    if (replyError && !isMissingTable(replyError)) out.errors.push(replyError.message)
    const replyIds = (replyRows ?? []).map(r => r.id as string)
    out.smsRepliesDue = replyIds.length

    // 46elks samtals-id med uppringarens nummer (045), samma period.
    const { data: inboundRows, error: inboundError } = await supabase
      .from('elks_inbound_calls')
      .select('id')
      .eq('agent_id', s.agent_id)
      .lt('created_at', cutoff(s.summary_days))
      .limit(500)
    if (inboundError && !isMissingTable(inboundError)) out.errors.push(inboundError.message)
    const inboundIds = (inboundRows ?? []).map(r => r.id as string)
    out.inboundCallsDue = inboundIds.length
    result.scanned += tRows.length + sRows.length + replyIds.length + inboundIds.length

    if (!dryRun && s.enabled) {
      out.transcriptsCleared = await clear(supabase, tRows.map(r => r.id as string), TRANSCRIPT_COLUMNS, out)
      out.summariesCleared = await clear(supabase, sRows.map(r => r.id as string), SUMMARY_COLUMNS, out)
      if (inboundIds.length > 0) {
        const { error: deleteError } = await supabase.from('elks_inbound_calls').delete().in('id', inboundIds)
        if (deleteError) out.errors.push(deleteError.message)
        else out.inboundCallsDeleted = inboundIds.length
      }
      if (replyIds.length > 0) {
        const { error: deleteError } = await supabase.from('call_sms_replies').delete().in('id', replyIds)
        if (deleteError) out.errors.push(deleteError.message)
        else out.smsRepliesDeleted = replyIds.length
      }

      // Hos ElevenLabs bara om kunden uttryckligen slagit på det. Oåterkalleligt
      // och hos tredje part, så det kräver ett eget beslut.
      if (s.delete_at_elevenlabs && elevenLabsKey) {
        out.elevenLabsDeleted = await deleteAtElevenLabs(tRows, elevenLabsKey, out)
      }
    }

    result.transcriptsCleared += out.transcriptsCleared
    result.summariesCleared += out.summariesCleared
    result.smsRepliesDeleted += out.smsRepliesDeleted
    result.elevenLabsDeleted += out.elevenLabsDeleted
    result.errors += out.errors.length
    result.agents.push(out)
    if (!result.userIds.includes(s.user_id)) result.userIds.push(s.user_id)
  }

  result.rateLimitRowsDeleted = await pruneRateLimits(supabase)
  return result
}

/**
 * Rensar public_rate_limit (050) på rader äldre än ett dygn. Inga
 * personuppgifter — nyckeln är en saltad hash av IP-adressen — men tabellen
 * ska inte växa för evigt. Körs därför också i torrkörning: det är teknisk
 * data, inte något som omfattas av lagringstiderna.
 */
async function pruneRateLimits(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from('public_rate_limit')
    .delete()
    .lt('window_start', cutoff(1))
    .select('bucket')
  if (error) {
    if (!isMissingTable(error)) console.error(`[retention] Kunde inte rensa public_rate_limit: ${error.message}`)
    return 0
  }
  return data?.length ?? 0
}

/** Tömmer kolumnerna på de angivna raderna. Returnerar hur många som tömdes. */
async function clear(
  supabase: SupabaseClient,
  ids: string[],
  cols: readonly string[],
  out: AgentOutcome,
): Promise<number> {
  if (ids.length === 0) return 0
  const patch: Record<string, unknown> = { retention_cleared_at: new Date().toISOString() }
  for (const c of cols) patch[c] = null

  const { error } = await supabase.from('call_logs').update(patch).in('id', ids)
  if (!error) return ids.length

  // retention_cleared_at är 036. Saknas den gallras ändå — spåret blir bara
  // otydligare, vilket är bättre än att personuppgifter ligger kvar.
  if (isMissingColumn(error)) {
    const fallback: Record<string, unknown> = {}
    for (const c of cols) fallback[c] = null
    const retry = await supabase.from('call_logs').update(fallback).in('id', ids)
    if (!retry.error) return ids.length
    out.errors.push(retry.error.message)
    return 0
  }
  out.errors.push(error.message)
  return 0
}

const CONVERSATION_ID = /conversation_id=(conv_[A-Za-z0-9]+)/

/**
 * Raderar motsvarande konversation hos ElevenLabs.
 *
 * DELETE /v1/convai/conversations/{id} — verifierad mot deras OpenAPI-spec
 * 2026-10-08, och endpointen svarar 404 på ett okänt id i stället för 403, så
 * den är nåbar för vårt konto.
 *
 * Måste ske FÖRE transkriptet töms lokalt, eftersom conversation_id står i
 * error_message som också nollas. Därför tar den emot raderna, inte id:na.
 */
async function deleteAtElevenLabs(
  rows: { error_message?: string | null }[],
  apiKey: string,
  out: AgentOutcome,
): Promise<number> {
  let deleted = 0
  for (const row of rows) {
    const id = row.error_message?.match(CONVERSATION_ID)?.[1]
    if (!id) continue
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { 'xi-api-key': apiKey }, signal: AbortSignal.timeout(8_000),
      })
      // 404 betyder att den redan är borta — lika bra som att vi raderade den.
      if (res.ok || res.status === 404) deleted++
      else out.errors.push(`ElevenLabs ${res.status} för ${id}`)
    } catch (err) {
      out.errors.push(`ElevenLabs nåddes inte för ${id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return deleted
}
