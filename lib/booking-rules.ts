// What a valid booking is, for the public BOS calendar's write routes
// (/api/public-agent/[shareId]/bookings). The routes turn a request body into a
// row only through these two functions, so every rule lives in one place:
//
//   - the body is allow-listed: unknown keys are refused, never ignored
//   - a booking ends after it starts, lasts at most 12 hours, and starts no more
//     than a year back or two years ahead
//   - text fields are trimmed and length-capped
//
// The database repeats the order, duration and length rules as CHECK constraints
// (029_bos_client_mode_bookings.sql). The time window depends on now(), which a
// constraint must not use, so that one lives only here.
//
// Deliberately free of imports so it can be unit-tested with plain `node`.

export const BOOKING_TITLE_MAX = 120
export const BOOKING_NAME_MAX = 80
export const BOOKING_NOTE_MAX = 2000
export const BOOKING_MAX_DURATION_MIN = 12 * 60
export const BOOKING_MAX_DAYS_AHEAD = 730
export const BOOKING_MAX_DAYS_BACK = 365

/** Full ISO 8601 with an explicit offset — what Date.prototype.toISOString() sends. */
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-](\d{2}):(\d{2}))$/

/**
 * The string, parsed — or null unless every field is a real calendar value.
 * `new Date()` alone is not enough: it rolls impossible days over instead of
 * refusing them ("2026-02-31" becomes 3 March), which is how an impossible date
 * reached the table in testing on 2026-09-29.
 */
function strictInstant(v: string): Date | null {
  const m = v.match(ISO_INSTANT)
  if (!m) return null
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4], m[5]].map(Number)
  const s = Number(m[6] ?? 0)
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth || h > 23 || mi > 59 || s > 59) return null
  if (m[7] !== 'Z' && (Number(m[8]) > 14 || Number(m[9]) > 59)) return null
  const t = new Date(v)
  return Number.isNaN(t.getTime()) ? null : t
}
const REF = /^[0-9a-f]{32}$/
const DAY_MS = 86_400_000

export interface BookingFields {
  title: string
  startsAt: string
  endsAt: string
  callerName: string | null
  note: string | null
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

const CREATE_KEYS = ['title', 'startsAt', 'endsAt', 'callerName', 'note', 'callRef']
const UPDATE_KEYS = ['title', 'startsAt', 'endsAt', 'callerName', 'note']

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error })

function asObject(body: unknown, allowed: string[]): Checked<Record<string, unknown>> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('Ogiltig förfrågan.')
  const unknown = Object.keys(body).filter(k => !allowed.includes(k))
  if (unknown.length > 0) return fail(`Okänt fält: ${unknown.join(', ')}.`)
  return { ok: true, value: body as Record<string, unknown> }
}

function title(v: unknown): Checked<string> {
  if (typeof v !== 'string') return fail('Titeln måste vara text.')
  const t = v.trim()
  if (!t) return fail('Bokningen behöver en titel.')
  if (t.length > BOOKING_TITLE_MAX) return fail(`Titeln får vara högst ${BOOKING_TITLE_MAX} tecken.`)
  return { ok: true, value: t }
}

function optionalText(v: unknown, max: number, what: string): Checked<string | null> {
  if (v === null || v === undefined) return { ok: true, value: null }
  if (typeof v !== 'string') return fail(`${what} måste vara text.`)
  const t = v.trim()
  if (t.length > max) return fail(`${what} får vara högst ${max} tecken.`)
  return { ok: true, value: t || null }
}

function instant(v: unknown, what: string): Checked<string> {
  if (typeof v !== 'string' || !ISO_INSTANT.test(v)) return fail(`${what} har fel format.`)
  const t = strictInstant(v)
  if (!t) return fail(`${what} är inte en giltig tidpunkt.`)
  return { ok: true, value: t.toISOString() }
}

/** A query-string instant (the calendar's visible window), or null if it is not one. */
export function parseInstantParam(v: string | null): Date | null {
  return v ? strictInstant(v) : null
}

/** The rules that relate start, end and now to each other. */
export function checkTimes(startsAt: string, endsAt: string, now: Date): string | null {
  const start = new Date(startsAt).getTime()
  const end = new Date(endsAt).getTime()
  if (end <= start) return 'Sluttiden måste vara efter starttiden.'
  if (end - start > BOOKING_MAX_DURATION_MIN * 60_000) return 'En bokning kan vara högst 12 timmar.'
  if (start < now.getTime() - BOOKING_MAX_DAYS_BACK * DAY_MS) return 'Bokningen ligger för långt bak i tiden (högst ett år).'
  if (start > now.getTime() + BOOKING_MAX_DAYS_AHEAD * DAY_MS) return 'Bokningen ligger för långt fram i tiden (högst två år).'
  return null
}

export function parseBookingCreate(body: unknown, now: Date): Checked<BookingFields & { callRef: string | null }> {
  const obj = asObject(body, CREATE_KEYS)
  if (!obj.ok) return obj
  const b = obj.value

  const t = title(b.title)
  if (!t.ok) return t
  const s = instant(b.startsAt, 'Starttiden')
  if (!s.ok) return s
  const e = instant(b.endsAt, 'Sluttiden')
  if (!e.ok) return e
  const name = optionalText(b.callerName, BOOKING_NAME_MAX, 'Namnet')
  if (!name.ok) return name
  const note = optionalText(b.note, BOOKING_NOTE_MAX, 'Anteckningen')
  if (!note.ok) return note

  let callRef: string | null = null
  if (b.callRef !== undefined && b.callRef !== null) {
    if (typeof b.callRef !== 'string' || !REF.test(b.callRef)) return fail('Ogiltig samtalsreferens.')
    callRef = b.callRef
  }

  const timeError = checkTimes(s.value, e.value, now)
  if (timeError) return fail(timeError)

  return {
    ok: true,
    value: { title: t.value, startsAt: s.value, endsAt: e.value, callerName: name.value, note: note.value, callRef },
  }
}

/**
 * A partial update, checked against the booking as it stands: start and end are
 * validated together even when only one of them changes. The time window is
 * only applied when a time is being changed, so a note can still be added to an
 * old booking.
 */
export function parseBookingUpdate(
  body: unknown,
  current: BookingFields,
  now: Date,
): Checked<{ patch: Partial<BookingFields> }> {
  const obj = asObject(body, UPDATE_KEYS)
  if (!obj.ok) return obj
  const b = obj.value
  if (Object.keys(b).length === 0) return fail('Inget att ändra.')

  const patch: Partial<BookingFields> = {}
  if ('title' in b) { const t = title(b.title); if (!t.ok) return t; patch.title = t.value }
  if ('startsAt' in b) { const s = instant(b.startsAt, 'Starttiden'); if (!s.ok) return s; patch.startsAt = s.value }
  if ('endsAt' in b) { const e = instant(b.endsAt, 'Sluttiden'); if (!e.ok) return e; patch.endsAt = e.value }
  if ('callerName' in b) { const n = optionalText(b.callerName, BOOKING_NAME_MAX, 'Namnet'); if (!n.ok) return n; patch.callerName = n.value }
  if ('note' in b) { const n = optionalText(b.note, BOOKING_NOTE_MAX, 'Anteckningen'); if (!n.ok) return n; patch.note = n.value }

  if (patch.startsAt !== undefined || patch.endsAt !== undefined) {
    const timeError = checkTimes(patch.startsAt ?? current.startsAt, patch.endsAt ?? current.endsAt, now)
    if (timeError) return fail(timeError)
  }

  return { ok: true, value: { patch } }
}
