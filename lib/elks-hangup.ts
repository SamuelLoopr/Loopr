import type { SupabaseClient } from '@supabase/supabase-js'

// Att lägga på ett SIP-samtal från vår sida, hos 46elks.
//
// ElevenLabs end_call avslutar konversationen men skickar ingen SIP BYE till
// 46elks, så telefonlinjen ligger kvar (uppmätt 27 s 2026-10-22). 46elks har
// ett odokumenterat sätt att lägga på ett pågående samtal: POST
// /a1/calls/{id} med hangup=yes. Prövat på ett riktigt samtal 2026-10-22 —
// linjen släppte direkt, och svaret var samtalet med state "success".
//
// Två steg:
//   1. rememberInboundCall — incoming-call sparar 46elks samtals-id, men BARA
//      för agenter med sip_hangup_tool = true, och efter att samtalet redan
//      kopplats (next/server `after`). Inga andra agenter får någon skrivning.
//   2. hangUpConversation — anropas av verktyget lagg_pa när agenten talat
//      klart (execution_mode post_tool_speech hos ElevenLabs). Hittar exakt
//      ett pågående samtal, låser raden och lägger på.
//
// 46elks svar loggas aldrig och sparas aldrig — de innehåller bland annat
// URL:en med vår webhook-token. Bara status och längd.

const ELKS_CALLS = 'https://api.46elks.com/a1/calls'
const TIMEOUT_MS = 5_000

/** Hur gamla samtal som kan vara det som ska läggas på. */
const CANDIDATE_WINDOW_MS = 60 * 60 * 1000

/**
 * Paus mellan att agenten talat klart och att linjen bryts, så att de sista
 * stavelserna hinner fram. Samma tanke som pausen på en sekund efter strömmen
 * på Twilio-vägen (lib/twiml-pause.ts).
 */
export const HANGUP_DELAY_MS = 1_000

const CONVERSATION_ID = /^conv_[A-Za-z0-9]+$/

function elksAuth(): string | null {
  const user = process.env.ELKS_API_USERNAME?.trim()
  const pass = process.env.ELKS_API_PASSWORD?.trim()
  return user && pass ? `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` : null
}

/** Bara state och längd ur 46elks svar; resten läses aldrig vidare. */
function summarize(data: unknown): { state: string | null; duration: number | null } {
  const d = (data ?? {}) as Record<string, unknown>
  return {
    state: typeof d.state === 'string' ? d.state : null,
    duration: typeof d.duration === 'number' ? d.duration : null,
  }
}

async function callState(auth: string, callid: string): Promise<{ state: string | null; duration: number | null }> {
  try {
    const res = await fetch(`${ELKS_CALLS}/${encodeURIComponent(callid)}`, {
      headers: { authorization: auth },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return { state: `http_${res.status}`, duration: null }
    return summarize(await res.json())
  } catch {
    return { state: 'network_error', duration: null }
  }
}

/**
 * Sparar 46elks samtals-id för ett inkommande samtal — bara om agenten har
 * sip_hangup_tool påslaget. Körs efter att 46elks fått sitt svar, så det kan
 * aldrig fördröja eller stoppa att samtalet kopplas. Kastar aldrig.
 */
export async function rememberInboundCall(
  supabase: SupabaseClient,
  call: { agentId: string; callid: string; from: string | null; to: string },
): Promise<void> {
  try {
    const { data, error } = await supabase.from('agents').select('sip_hangup_tool').eq('id', call.agentId).maybeSingle()
    if (error || data?.sip_hangup_tool !== true) return

    const { error: insertError } = await supabase.from('elks_inbound_calls').insert({
      agent_id: call.agentId,
      callid: call.callid,
      from_number: call.from,
      to_number: call.to,
    })
    if (insertError && insertError.code !== '23505') {
      console.error(`[elks-hangup] Kunde inte spara samtals-id: ${insertError.message}`)
    }
  } catch (err) {
    console.error('[elks-hangup] Sparandet kastade:', err)
  }
}

export type HangupOutcome =
  | 'hung_up' | 'not_ongoing' | 'already' | 'no_match' | 'ambiguous'
  | 'not_configured' | 'malformed' | 'failed'

/**
 * Lägger på samtalet som hör till en konversation som just avslutats.
 *
 * Kandidater: sparade samtal till samma nummer den senaste timmen som inte
 * redan lagts på, och som 46elks säger fortfarande pågår. Är det fler än ett
 * avgör uppringarens nummer. Exakt ett måste återstå — annars görs ingenting,
 * eftersom fel samtal är värre än en linje som ligger kvar.
 */
export async function hangUpConversation(
  supabase: SupabaseClient,
  input: { conversationId: string; calledNumber: string; callerId: string | null },
  { delayMs = HANGUP_DELAY_MS }: { delayMs?: number } = {},
): Promise<HangupOutcome> {
  if (!CONVERSATION_ID.test(input.conversationId) || !/^\+\d{6,15}$/.test(input.calledNumber)) return 'malformed'
  const auth = elksAuth()
  if (!auth) return 'not_configured'

  // Högst en gång per konversation.
  const { data: done } = await supabase
    .from('elks_inbound_calls')
    .select('id')
    .eq('conversation_id', input.conversationId)
    .limit(1)
  if (done && done.length > 0) return 'already'

  const since = new Date(Date.now() - CANDIDATE_WINDOW_MS).toISOString()
  const { data: rows, error } = await supabase
    .from('elks_inbound_calls')
    .select('id, callid, from_number')
    .eq('to_number', input.calledNumber)
    .is('hangup_requested_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) {
    console.error(`[elks-hangup] Kunde inte läsa samtal: ${error.message}`)
    return 'failed'
  }

  const ongoing: { id: string; callid: string; from_number: string | null }[] = []
  for (const row of rows ?? []) {
    if ((await callState(auth, row.callid as string)).state === 'ongoing') {
      ongoing.push(row as { id: string; callid: string; from_number: string | null })
    }
  }
  let match = ongoing
  if (match.length > 1) match = match.filter(r => input.callerId && r.from_number === input.callerId)
  if (match.length === 0) return ongoing.length > 1 ? 'ambiguous' : 'no_match'
  if (match.length > 1) return 'ambiguous'
  const target = match[0]

  // Lås raden innan något görs.
  const { data: locked, error: lockError } = await supabase
    .from('elks_inbound_calls')
    .update({ conversation_id: input.conversationId, hangup_requested_at: new Date().toISOString() })
    .eq('id', target.id)
    .is('hangup_requested_at', null)
    .select('id')
    .maybeSingle()
  if (lockError || !locked) return 'already'

  if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs))

  let outcome: HangupOutcome
  let detail: string
  const before = await callState(auth, target.callid)
  if (before.state !== 'ongoing') {
    outcome = 'not_ongoing'
    detail = `inte pågående (${before.state ?? 'okänt'})`
  } else {
    try {
      const res = await fetch(`${ELKS_CALLS}/${encodeURIComponent(target.callid)}`, {
        method: 'POST',
        headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ hangup: 'yes' }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const after = res.ok ? summarize(await res.json().catch(() => null)) : { state: null, duration: null }
      outcome = res.ok ? 'hung_up' : 'failed'
      detail = res.ok ? `lagt på (${after.state ?? '?'}, ${after.duration ?? '?'} s)` : `46elks HTTP ${res.status}`
    } catch {
      outcome = 'failed'
      detail = 'nätverksfel mot 46elks'
    }
  }

  await supabase.from('elks_inbound_calls').update({ hangup_result: detail.slice(0, 100) }).eq('id', target.id)
  console.log(`[elks-hangup] ${input.conversationId}: ${detail}`)
  return outcome
}
