import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingColumn } from '@/lib/db-errors'
import { parseTwilioPrice } from '@/lib/service-pricing'

// Hämtar vad ett samtal kostade hos Twilio och ElevenLabs och skriver in det på
// raden. Körs från dashboardsidan "Aktiva klienter" (/api/admin/client-costs).
//
// Båda går att hämta i efterhand, verifierat mot de riktiga API:erna 2026-10-01.
// Anthropic gör det INTE — där loggas tokens vid anropet i stället
// (lib/call-insights.ts), så den kostnaden syns bara för samtal analyserade
// efter migration 031.
//
// Serveronly: läser TWILIO_* och ELEVENLABS_API_KEY och kör på service-rollen.

const CONVERSATION_ID = /conversation_id=(conv_[A-Za-z0-9]+)/

/** Hur många samtal som kostnadshämtas per körning. */
const PER_RUN = 40

/**
 * Twilios pris dyker upp några minuter efter att samtalet avslutats. Ett samtal
 * som är nyare än så lämnas osynkat, så att en tom prisruta inte låses in som
 * "kostar noll".
 */
const MIN_AGE_MS = 10 * 60 * 1000

interface Row {
  id: string
  created_at: string
  from_number: string | null
  to_number: string | null
  duration_sec: number | null
  error_message: string | null
  twilio_call_sid: string | null
}

interface TwilioCall {
  sid: string
  from: string
  to: string
  start_time: string
  duration: string
  price: string | null
}

export interface CostSyncResult {
  considered: number
  updated: number
  twilioFound: number
  elevenLabsFound: number
  /** Satt när kolumnerna från 031 inte finns än. */
  unsupported?: boolean
  note?: string
}

export async function syncCallCosts(supabase: SupabaseClient): Promise<CostSyncResult> {
  const cutoff = new Date(Date.now() - MIN_AGE_MS).toISOString()

  const { data, error } = await supabase
    .from('call_logs')
    .select('id, created_at, from_number, to_number, duration_sec, error_message, twilio_call_sid')
    .eq('status', 'completed')
    .is('cost_synced_at', null)
    .lt('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(PER_RUN)

  if (error) {
    if (isMissingColumn(error)) return { considered: 0, updated: 0, twilioFound: 0, elevenLabsFound: 0, unsupported: true }
    console.error('[cost-sync] Kunde inte läsa samtal:', error.message)
    return { considered: 0, updated: 0, twilioFound: 0, elevenLabsFound: 0, note: error.message }
  }

  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return { considered: 0, updated: 0, twilioFound: 0, elevenLabsFound: 0 }

  const twilioCalls = await fetchTwilioCalls(rows)
  let updated = 0, twilioFound = 0, elevenLabsFound = 0

  for (const row of rows) {
    const twilio = matchTwilio(row, twilioCalls)
    const elevenLabsUsd = await fetchElevenLabsCost(row)

    if (twilio?.price != null) twilioFound++
    if (elevenLabsUsd != null) elevenLabsFound++

    const { error: updateError } = await supabase
      .from('call_logs')
      .update({
        twilio_call_sid: row.twilio_call_sid ?? twilio?.sid ?? null,
        cost_twilio_usd: twilio ? parseTwilioPrice(twilio.price) : null,
        cost_elevenlabs_usd: elevenLabsUsd,
        cost_synced_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    if (updateError) console.error(`[cost-sync] Kunde inte spara kostnad för ${row.id}: ${updateError.message}`)
    else updated++
  }

  return { considered: rows.length, updated, twilioFound, elevenLabsFound }
}

// ── Twilio ──────────────────────────────────────────────────────────────────

/**
 * Hämtar Twilios samtal en gång för hela intervallet i stället för ett anrop per
 * rad. Filtreras på startdatum så listan inte växer med kontots hela historik.
 */
async function fetchTwilioCalls(rows: Row[]): Promise<TwilioCall[]> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return []

  const oldest = rows.reduce((min, r) => (r.created_at < min ? r.created_at : min), rows[0].created_at)
  // Twilios StartTime>= tar ett datum (YYYY-MM-DD), inte en tidpunkt.
  const since = new Date(new Date(oldest).getTime() - 86_400_000).toISOString().slice(0, 10)

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Calls.json`
    + `?PageSize=1000&StartTime%3E=${since}`

  try {
    const res = await fetch(url, {
      headers: { authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') },
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error(`[cost-sync] Twilio svarade ${res.status}`)
      return []
    }
    const body = await res.json()
    return (body.calls ?? []) as TwilioCall[]
  } catch (err) {
    console.error('[cost-sync] Twilio nåddes inte:', err)
    return []
  }
}

/**
 * Parar ihop vår rad med Twilios samtal.
 *
 * Har raden ett sparat sid är det exakt. Äldre rader saknar det (sid började
 * sparas med migration 031), och matchas då på nummer + starttid + längd: vår
 * created_at ligger inom en sekund från Twilios start_time och längden är
 * identisk. Ett fönster på ±30 s räcker, och längden skiljer upprepade
 * uppringningar från samma nummer åt. Blir det ändå flera träffar returneras
 * ingen — hellre en tom ruta än fel siffra.
 */
function matchTwilio(row: Row, calls: TwilioCall[]): TwilioCall | null {
  if (row.twilio_call_sid) return calls.find(c => c.sid === row.twilio_call_sid) ?? null
  if (!row.from_number || !row.to_number) return null

  const t = new Date(row.created_at).getTime()
  const hits = calls.filter(c =>
    c.from === row.from_number &&
    c.to === row.to_number &&
    Math.abs(new Date(c.start_time).getTime() - t) < 30_000 &&
    (row.duration_sec == null || Math.abs(Number(c.duration) - row.duration_sec) <= 3),
  )
  return hits.length === 1 ? hits[0] : null
}

// ── ElevenLabs ──────────────────────────────────────────────────────────────

/** metadata.cost_fiat, i USD (bekräftat via /v1/user/subscription -> currency "usd"). */
async function fetchElevenLabsCost(row: Row): Promise<number | null> {
  const key = process.env.ELEVENLABS_API_KEY
  const conversationId = row.error_message?.match(CONVERSATION_ID)?.[1]
  if (!key || !conversationId) return null

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${encodeURIComponent(conversationId)}`,
      { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(10_000), cache: 'no-store' },
    )
    if (!res.ok) return null
    const body = await res.json()
    const fiat = body?.metadata?.cost_fiat
    return typeof fiat === 'number' && Number.isFinite(fiat) ? fiat : null
  } catch {
    return null
  }
}
