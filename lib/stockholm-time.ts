// Calendar arithmetic in Swedish time, for the BOS calendar.
//
// Bookings are stored as instants (timestamptz) and shown on a calendar whose
// days are Stockholm days — whatever time zone the viewer's device happens to
// be in. Everything that turns an instant into a day, or a day + clock time into
// an instant, goes through here, so a booking made at "14:00" is 14:00 in
// Sweden for everyone, including across the summer-time switches.
//
// Dates are 'YYYY-MM-DD' strings and times 'HH:MM' throughout. Deliberately free
// of imports so it can be unit-tested with plain `node`.

export const TIME_ZONE = 'Europe/Stockholm'

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})

interface WallClock { y: number; m: number; d: number; hh: number; mm: number; ss: number }

function wallClock(instant: Date): WallClock {
  const p = Object.fromEntries(PARTS.formatToParts(instant).map(x => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, ss: +p.second }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Minutes Stockholm is ahead of UTC at this instant: 60 in winter, 120 in summer. */
export function offsetMinutes(instant: Date): number {
  const w = wallClock(instant)
  const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss)
  const whole = Math.floor(instant.getTime() / 1000) * 1000
  return Math.round((asUtc - whole) / 60000)
}

/** The Stockholm day and clock time of an instant. */
export function toStockholm(instant: Date | string): { date: string; time: string } {
  const w = wallClock(typeof instant === 'string' ? new Date(instant) : instant)
  return { date: `${w.y}-${pad(w.m)}-${pad(w.d)}`, time: `${pad(w.hh)}:${pad(w.mm)}` }
}

/**
 * A Stockholm day + clock time -> the instant. A time that does not exist (the
 * hour skipped in March) lands an hour later; a time that happens twice (the
 * hour repeated in October) resolves to the second one. Either way the result is
 * a real instant the calendar will show back on the same day.
 */
export function fromStockholm(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const wall = Date.UTC(y, m - 1, d, hh, mm)
  const first = wall - offsetMinutes(new Date(wall)) * 60000
  return new Date(wall - offsetMinutes(new Date(first)) * 60000)
}

/** Calendar-day arithmetic on 'YYYY-MM-DD'; no time zone involved. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** Monday = 0 … Sunday = 6, the Swedish week. */
export function weekdayIndex(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

/** Monday of the week the date is in. */
export function startOfWeek(date: string): string {
  return addDays(date, -weekdayIndex(date))
}

export function todayInStockholm(now: Date = new Date()): string {
  return toStockholm(now).date
}

const DAY_MONTH = new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', day: 'numeric', month: 'short' })

/** '2026-10-03' -> '3 okt' (the date is already a Stockholm day, so UTC formats it as-is). */
export function formatDayMonth(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return DAY_MONTH.format(new Date(Date.UTC(y, m - 1, d))).replace('.', '')
}

/** An instant -> '3 okt kl 14:00', in Stockholm time. */
export function formatBookingWhen(instant: string): string {
  const s = toStockholm(instant)
  return `${formatDayMonth(s.date)} kl ${s.time}`
}
