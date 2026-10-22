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
//   2. linkConversation — conversation-init kopplar konversationen till
//      samtals-id:t när den startar, så att steg 3 blir en enda fråga.
//   3. hangUpConversation — anropas av verktyget lagg_pa när agenten talat
//      klart (execution_mode post_tool_speech hos ElevenLabs). Låser raden,
//      hämtar samtals-id:t och lägger på direkt.
//
// 46elks svar loggas aldrig och sparas aldrig — de innehåller bland annat
// URL:en med vår webhook-token. Bara status och längd.

const ELKS_CALLS = 'https://api.46elks.com/a1/calls'
const TIMEOUT_MS = 5_000

/** Hur gamla samtal som kan vara det som ska läggas på. */
const CANDIDATE_WINDOW_MS = 60 * 60 * 1000

/**
 * Paus mellan att agenten talat klart och att linjen bryts, så att de sista
 * stavelserna hinner fram i telefonen. ElevenLabs väntar redan tills talet är
 * klart (post_tool_speech); det här täcker bara ljudet som är på väg.
 * Uppmätt 2026-10-22: med 1 s och sökning bröts linjen ≈5 s efter hejdå.
 */
export const HANGUP_DELAY_MS = 300

/** Hur färskt ett 46elks-samtal ska vara för att kopplas vid konversationens start. */
const LINK_WINDOW_MS = 2 * 60 * 1000

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

/**
 * Kopplar en konversation till sitt 46elks-samtal redan när den startar
 * (conversation-init, efter svaret), så att påläggningen sedan är en enda
 * databasfråga. Nyaste okopplade raden till samma nummer från samma
 * uppringare de senaste två minuterna. Kastar aldrig; utan koppling faller
 * hangUpConversation tillbaka på att söka.
 */
export async function linkConversation(
  supabase: SupabaseClient,
  input: { conversationId: string; calledNumber: string | null; callerId: string | null },
): Promise<void> {
  try {
    if (!CONVERSATION_ID.test(input.conversationId) || !input.calledNumber) return
    const since = new Date(Date.now() - LINK_WINDOW_MS).toISOString()
    let q = supabase
      .from('elks_inbound_calls')
      .select('id')
      .eq('to_number', input.calledNumber)
      .is('conversation_id', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2)
    if (input.callerId) q = q.eq('from_number', input.callerId)
    const { data } = await q
    // Två okopplade samtal från samma nummer inom två minuter: avstå hellre.
    if (!data || data.length !== 1) return
    await supabase.from('elks_inbound_calls').update({ conversation_id: input.conversationId })
      .eq('id', data[0].id).is('conversation_id', null)
  } catch (err) {
    console.error('[elks-hangup] Kopplingen kastade:', err)
  }
}

export type HangupOutcome =
  | 'hung_up' | 'not_ongoing' | 'already' | 'no_match' | 'ambiguous'
  | 'not_configured' | 'malformed' | 'failed'

/**
 * Lägger på samtalet som hör till en konversation som just avslutats.
 *
 * Snabbvägen: raden kopplades till konversationen när den startade
 * (linkConversation). Då låses den och samtals-id:t hämtas i samma fråga, och
 * hangup=yes skickas direkt — ingen kontroll först. Ett samtal som redan
 * hunnit avslutas ger bara "redan avslutat" i loggen.
 *
 * Reservvägen, utan koppling: sparade samtal till samma nummer den senaste
 * timmen som 46elks säger fortfarande pågår. Är de fler än ett avgör
 * uppringarens nummer. Exakt ett måste återstå — annars görs ingenting,
 * eftersom fel samtal är värre än en linje som ligger kvar.
 */
export async function hangUpConversation(
  supabase: SupabaseClient,
  input: { conversationId: string; calledNumber: string; callerId: string | null },
  { delayMs = HANGUP_DELAY_MS }: { delayMs?: number } = {},
): Promise<HangupOutcome> {
  const t0 = Date.now()
  if (!CONVERSATION_ID.test(input.conversationId) || !/^\+\d{6,15}$/.test(input.calledNumber)) return 'malformed'
  const auth = elksAuth()
  if (!auth) return 'not_configured'

  // ── Snabbvägen: lås och hämta i en fråga ─────────────────────────────────
  const now = new Date().toISOString()
  const { data: linked, error: linkedError } = await supabase
    .from('elks_inbound_calls')
    .update({ hangup_requested_at: now })
    .eq('conversation_id', input.conversationId)
    .is('hangup_requested_at', null)
    .select('id, callid')
    .maybeSingle()
  if (linkedError) console.error(`[elks-hangup] Låset misslyckades: ${linkedError.message}`)

  let target = linked as { id: string; callid: string } | null
  let path = 'kopplad'
  if (!target) {
    // Redan pålagd (raden finns men är låst)?
    const { data: done } = await supabase
      .from('elks_inbound_calls').select('id').eq('conversation_id', input.conversationId).limit(1)
    if (done && done.length > 0) return 'already'
    const found = await searchCandidate(supabase, auth, input)
    if (typeof found === 'string') return found
    target = found
    path = 'sökt'
  }
  const tLock = Date.now()

  if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs))
  const tWait = Date.now()

  let outcome: HangupOutcome
  let what: string
  try {
    const res = await fetch(`${ELKS_CALLS}/${encodeURIComponent(target.callid)}`, {
      method: 'POST',
      headers: { authorization: auth, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ hangup: 'yes' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.ok) {
      const after = summarize(await res.json().catch(() => null))
      outcome = 'hung_up'
      what = `lagt på (${after.state ?? '?'}, ${after.duration ?? '?'} s)`
    } else if (res.status === 403 && (await res.text().catch(() => '')).includes('Invalid callid')) {
      outcome = 'not_ongoing'
      what = 'redan avslutat'
    } else {
      outcome = 'failed'
      what = `46elks HTTP ${res.status}`
    }
  } catch {
    outcome = 'failed'
    what = 'nätverksfel mot 46elks'
  }
  const tEnd = Date.now()

  const detail = `${what} · ${tEnd - t0} ms (${path} ${tLock - t0}, väntan ${tWait - tLock}, 46elks ${tEnd - tWait})`
  await supabase.from('elks_inbound_calls').update({ hangup_result: detail.slice(0, 100) }).eq('id', target.id)
  console.log(`[elks-hangup] ${input.conversationId}: ${detail}`)
  return outcome
}

/** Reservvägen: exakt ett pågående sparat samtal, låst. */
async function searchCandidate(
  supabase: SupabaseClient,
  auth: string,
  input: { conversationId: string; calledNumber: string; callerId: string | null },
): Promise<{ id: string; callid: string } | HangupOutcome> {
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

  const { data: locked, error: lockError } = await supabase
    .from('elks_inbound_calls')
    .update({ conversation_id: input.conversationId, hangup_requested_at: new Date().toISOString() })
    .eq('id', match[0].id)
    .is('hangup_requested_at', null)
    .select('id, callid')
    .maybeSingle()
  if (lockError || !locked) return 'already'
  return locked as { id: string; callid: string }
}
