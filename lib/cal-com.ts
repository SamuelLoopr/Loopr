import { toStockholm, weekdayIndex } from '@/lib/stockholm-time'

// Cal.com API v2: lediga tider och bokningar.
//
// v1 lades ned av Cal.com (svarar 410 sedan 2026), så allt som rör kalendern
// går genom den här modulen. Används av säljlinjens verktyg
// (app/api/webhooks/elevenlabs/sales) och av dashboardens Kalender-flik
// (app/api/cal-com).
//
// Serveronly: läser CAL_COM_API_KEY. Nyckeln skickas som Bearer, aldrig i
// URL:en. Svar från Cal.com loggas aldrig i sin helhet — de innehåller
// deltagarnas namn och e-post.

const BASE = 'https://api.cal.com/v2'
const TIMEOUT_MS = 8_000
export const TIME_ZONE = 'Europe/Stockholm'

/** Versionshuvudet skiljer sig per endpoint i v2. */
const SLOTS_VERSION = '2024-09-04'
const BOOKINGS_VERSION = '2024-08-13'

function apiKey(): string | null {
  return process.env.CAL_COM_API_KEY?.trim() || null
}

function headers(version: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey()}`,
    'cal-api-version': version,
    'content-type': 'application/json',
  }
}

/**
 * Lediga starttider (ISO) för en eventtyp mellan två tidpunkter, i tidsordning.
 * null när Cal.com inte gick att nå eller nyckeln saknas; tom lista när det
 * inte finns några tider.
 */
export async function availableSlots(eventTypeId: string, start: Date, end: Date): Promise<string[] | null> {
  if (!apiKey()) return null
  const params = new URLSearchParams({
    eventTypeId,
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: TIME_ZONE,
  })
  try {
    const res = await fetch(`${BASE}/slots?${params}`, { headers: headers(SLOTS_VERSION), signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) {
      console.error(`[cal-com] slots svarade ${res.status}`)
      return null
    }
    const body = (await res.json()) as { data?: Record<string, ({ start?: string } | string)[]> }
    const out: string[] = []
    for (const day of Object.values(body.data ?? {})) {
      for (const slot of day) {
        const s = typeof slot === 'string' ? slot : slot.start
        if (s && !Number.isNaN(Date.parse(s))) out.push(new Date(s).toISOString())
      }
    }
    return out.sort()
  } catch (err) {
    console.error('[cal-com] slots nåddes inte:', err instanceof Error ? err.message : err)
    return null
  }
}

export interface OfferedSlot {
  n: 1 | 2
  /** ISO, UTC. */
  start: string
  /** "tisdag 18 november klockan 10" — det agenten säger. */
  spoken: string
}

const WEEKDAY = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag']
const MONTH = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september',
  'oktober', 'november', 'december']

/** "tisdag 18 november klockan 10" eller "… klockan 10:30", svensk tid. */
export function spokenSlot(iso: string): string {
  const { date, time } = toStockholm(iso)
  const [, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':')
  const clock = mm === '00' ? String(Number(hh)) : `${Number(hh)}:${mm}`
  return `${WEEKDAY[weekdayIndex(date)]} ${d} ${MONTH[m - 1]} klockan ${clock}`
}

/** Minsta förvarning innan en tid får erbjudas. */
const LEAD_TIME_MS = 2 * 60 * 60 * 1000

/**
 * Två tider att erbjuda: den första lediga vardagstiden minst två timmar fram,
 * och den första på en annan dag — så personen får ett riktigt val. Finns
 * ingen annan dag tas nästa tid samma dag minst två timmar senare. Fri från
 * nätverk så den kan testas för sig.
 */
export function pickTwoSlots(slots: string[], now: Date = new Date()): OfferedSlot[] {
  const earliest = now.getTime() + LEAD_TIME_MS
  const ok = slots
    .filter(s => Date.parse(s) >= earliest)
    .filter(s => weekdayIndex(toStockholm(s).date) < 5)
  if (ok.length === 0) return []
  const first = ok[0]
  const firstDay = toStockholm(first).date
  const second = ok.find(s => toStockholm(s).date !== firstDay)
    ?? ok.find(s => Date.parse(s) >= Date.parse(first) + LEAD_TIME_MS)
  const out: OfferedSlot[] = [{ n: 1, start: first, spoken: spokenSlot(first) }]
  if (second) out.push({ n: 2, start: second, spoken: spokenSlot(second) })
  return out
}

export type BookingResult =
  | { ok: true; uid: string; start: string }
  | { ok: false; reason: 'taken' | 'failed' | 'not_configured' }

/**
 * Bokar en tid. 'taken' när Cal.com säger att tiden inte längre är ledig
 * (409 eller 400 med "available"/"slot" i texten), 'failed' för allt annat.
 */
export async function createBooking(input: {
  eventTypeId: string
  start: string
  name: string
  email: string
  notes?: string
  metadata?: Record<string, string>
}): Promise<BookingResult> {
  if (!apiKey()) return { ok: false, reason: 'not_configured' }
  const body = {
    start: input.start,
    eventTypeId: Number(input.eventTypeId),
    attendee: { name: input.name, email: input.email, timeZone: TIME_ZONE, language: 'sv' },
    ...(input.notes ? { bookingFieldsResponses: { notes: input.notes } } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  }
  try {
    const res = await fetch(`${BASE}/bookings`, {
      method: 'POST', headers: headers(BOOKINGS_VERSION), body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const text = await res.text()
    if (!res.ok) {
      const lower = text.toLowerCase()
      const taken = res.status === 409 || (res.status === 400 && (lower.includes('available') || lower.includes('slot')))
      console.error(`[cal-com] bookings svarade ${res.status}${taken ? ' (tiden upptagen)' : ''}`)
      return { ok: false, reason: taken ? 'taken' : 'failed' }
    }
    const parsed = JSON.parse(text) as { data?: { uid?: string; start?: string } | { uid?: string; start?: string }[] }
    const data = Array.isArray(parsed.data) ? parsed.data[0] : parsed.data
    if (!data?.uid) return { ok: false, reason: 'failed' }
    return { ok: true, uid: data.uid, start: data.start ?? input.start }
  } catch (err) {
    console.error('[cal-com] bookings nåddes inte:', err instanceof Error ? err.message : err)
    return { ok: false, reason: 'failed' }
  }
}
