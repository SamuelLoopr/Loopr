import { addDays, startOfWeek, toStockholm, todayInStockholm, weekdayIndex } from '@/lib/stockholm-time'

// The prefill for "Boka in" on a call card: a title and a proposed day and time,
// taken from what Claude already wrote about the call (contact_note, summary).
//
// Only ever a suggestion. The form says what it was based on, and the client
// changes anything before saving. Relative words are read from the day of the
// CALL, not today: "imorgon" said on 28 Sep means 29 Sep. A suggestion that has
// already passed falls back to the next working day.
//
// The text is split into words rather than matched with \b: JavaScript's \b
// treats å, ä and ö as non-letters, so /\bövermorgon/ or /måndag\b/ would miss.

export interface BookingSuggestion {
  title: string
  /** Stockholm day, 'YYYY-MM-DD'. */
  date: string
  /** 'HH:MM'. */
  time: string
  durationMin: number
  /** What in the call the day or time came from — null when it is only the default. */
  basis: string | null
}

export interface SuggestFrom {
  startedAt: string
  callerName: string | null
  contactRequest: string | null
  contactNote: string | null
  summary: string
}

const WEEKDAYS = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag']
const DEFAULT_TIME = '09:00'
const PART_OF_DAY: Record<string, string> = {
  förmiddag: '09:00', förmiddagen: '09:00',
  eftermiddag: '13:00', eftermiddagen: '13:00',
  kväll: '17:00', kvällen: '17:00',
}

const pad = (n: number) => String(n).padStart(2, '0')

/** The next Monday–Friday after `date`. */
function nextWorkday(date: string): string {
  let d = addDays(date, 1)
  while (weekdayIndex(d) > 4) d = addDays(d, 1)
  return d
}

function readTime(token: string | undefined): string | null {
  const m = token?.match(/^(\d{1,2})(?:[:.](\d{2}))?$/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2] ?? 0)
  if (hh < 6 || hh > 21 || mm > 59) return null
  return `${pad(hh)}:${pad(mm)}`
}

export function suggestBooking(call: SuggestFrom, now: Date = new Date()): BookingSuggestion {
  const title =
    (call.contactNote?.trim() || (call.callerName ? `Samtal med ${call.callerName}` : 'Uppföljning av samtal'))
      .slice(0, 120)

  const today = todayInStockholm(now)
  const callDay = toStockholm(call.startedAt).date
  const words = `${call.contactNote ?? ''} ${call.summary}`
    .toLowerCase()
    .split(/[^a-zåäöé0-9:.]+/)
    .map(w => w.replace(/[.:]+$/, ''))
    .filter(Boolean)
  const at = (i: number) => words[i]
  const indexOf = (...seq: string[]) => words.findIndex((_, i) => seq.every((w, j) => at(i + j) === w))

  // ── Day ───────────────────────────────────────────────────────────────────
  let date: string | null = null
  let dayBasis: string | null = null

  const weekdayAt = words.findIndex(w => WEEKDAYS.includes(w.replace(/en$/, '')))
  if (weekdayAt >= 0) {
    const word = words[weekdayAt]
    const target = WEEKDAYS.indexOf(word.replace(/en$/, ''))
    let delta = (target - weekdayIndex(callDay) + 7) % 7 || 7
    // "nästa torsdag" on a Monday means the Thursday of next week.
    const sameWeek = delta <= 6 - weekdayIndex(callDay)
    if (at(weekdayAt - 1) === 'nästa' && sameWeek) delta += 7
    date = addDays(callDay, delta)
    dayBasis = at(weekdayAt - 1) === 'nästa' ? `nästa ${word}` : word
  } else if (indexOf('idag') >= 0 || indexOf('i', 'dag') >= 0) {
    date = callDay
    dayBasis = 'idag'
  } else if (indexOf('imorgon') >= 0 || indexOf('i', 'morgon') >= 0) {
    date = addDays(callDay, 1)
    dayBasis = 'imorgon'
  } else if (indexOf('övermorgon') >= 0) {
    date = addDays(callDay, 2)
    dayBasis = 'i övermorgon'
  } else if (indexOf('nästa', 'vecka') >= 0) {
    date = addDays(startOfWeek(callDay), 7)
    dayBasis = 'nästa vecka'
  }

  // A day that has already passed is no suggestion at all.
  if (date && date < today) {
    date = null
    dayBasis = null
  }

  // ── Time ──────────────────────────────────────────────────────────────────
  let time: string | null = null
  let timeBasis: string | null = null

  const klAt = words.findIndex(w => w === 'kl' || w === 'klockan')
  if (klAt >= 0) {
    time = readTime(at(klAt + 1))
    if (time) timeBasis = `kl ${time}`
  }
  if (!time) {
    const part = words.find(w => w in PART_OF_DAY)
    if (part) {
      time = PART_OF_DAY[part]
      timeBasis = part
    }
  }

  // ── Defaults ──────────────────────────────────────────────────────────────
  let finalDate = date ?? nextWorkday(today)
  const finalTime = time ?? DEFAULT_TIME

  // Today, but the time is already gone: the next working day instead — and the
  // day is then no longer the one the caller named, so it is not credited to them.
  if (finalDate === today && finalTime <= toStockholm(now).time) {
    finalDate = nextWorkday(today)
    dayBasis = null
  }

  const basisParts = [dayBasis, timeBasis].filter(Boolean).map(b => `”${b}”`)

  return {
    title,
    date: finalDate,
    time: finalTime,
    durationMin: call.contactRequest === 'meeting' ? 60 : 30,
    basis: basisParts.length ? `Utifrån samtalet: ${basisParts.join(', ')}` : null,
  }
}
