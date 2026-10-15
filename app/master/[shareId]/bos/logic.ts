// Ren logik för klientens BOS-sida (app/master/[shareId] i klientläge): tider,
// kväll och helg, telefonnummer, sökning, filter och veckans siffror.
//
// Inga React-, DOM- eller nätverksberoenden, så allt här går att testa med node.
// Alla dagar är svenska dagar oavsett vilken tidszon enheten står i
// (lib/stockholm-time.ts).

import { CONTACT_REQUEST_LABEL, type PublicCall } from '@/lib/public-calls'
import type { ClientStatus } from '@/lib/client-status'
import { addDays, startOfWeek, toStockholm, todayInStockholm, weekdayIndex } from '@/lib/stockholm-time'

// ── Statuskolumnerna ──────────────────────────────────────────────────────────

export type GroupKey = 'nya' | 'vantar' | 'offert' | 'klart'

/**
 * Samma fyra grupper som lib/client-status.ts (CRM_GROUPS), med det sidan
 * behöver för att rita dem. Fem statusar på fyra kolumner: "Bokad" och
 * "Avslutad" är båda klara.
 */
export const GROUPS: { key: GroupKey; label: string; statuses: readonly ClientStatus[]; empty: string }[] = [
  { key: 'nya', label: 'Nya samtal', statuses: ['ny'], empty: 'Inga nya samtal.' },
  { key: 'vantar', label: 'Väntar på återkoppling', statuses: ['kontaktad'], empty: 'Inget väntar på återkoppling.' },
  { key: 'offert', label: 'Offert skickad', statuses: ['offert_skickad'], empty: 'Inga skickade offerter.' },
  { key: 'klart', label: 'Klart', statuses: ['bokad', 'avslutad'], empty: 'Inget avslutat ännu.' },
]

export function groupOf(status: ClientStatus): GroupKey {
  return GROUPS.find(g => g.statuses.includes(status))?.key ?? 'nya'
}

export function groupLabel(key: GroupKey): string {
  return GROUPS.find(g => g.key === key)?.label ?? ''
}

/** Statusen ett ärende får när det flyttas till en kolumn. Klart behåller "Bokad". */
export function statusForGroup(key: GroupKey, current: ClientStatus): ClientStatus {
  if (key === 'klart') return current === 'bokad' ? 'bokad' : 'avslutad'
  return ({ nya: 'ny', vantar: 'kontaktad', offert: 'offert_skickad' } as const)[key]
}

/** Snabbknapparna på korten: det som hände, och kolumnen ärendet flyttas till. */
export const QUICK_ACTIONS: { label: string; status: ClientStatus; group: GroupKey }[] = [
  { label: 'Ringt upp', status: 'kontaktad', group: 'vantar' },
  { label: 'Offert skickad', status: 'offert_skickad', group: 'offert' },
  { label: 'Klar', status: 'avslutad', group: 'klart' },
]

// Nya samtal: de som vill bli kontaktade först, sedan nyast först. Övriga
// kolumner: nyast först. Tidsstämplarna från PostgREST har samma format och
// sorteras därför som strängar.
const newestFirst = (a: PublicCall, b: PublicCall) => b.startedAt.localeCompare(a.startedAt)
const requestsFirst = (a: PublicCall, b: PublicCall) =>
  Number(Boolean(b.contactRequest)) - Number(Boolean(a.contactRequest)) || newestFirst(a, b)

export function sortForGroup(key: GroupKey, calls: PublicCall[]): PublicCall[] {
  return [...calls].sort(key === 'nya' ? requestsFirst : newestFirst)
}

// ── Tider ─────────────────────────────────────────────────────────────────────

const LAST_WEEKDAY = ['i måndags', 'i tisdags', 'i onsdags', 'i torsdags', 'i fredags', 'i lördags', 'i söndags']
const WEEKDAY = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag']
const MONTH_SHORT = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const MONTH_LONG = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september',
  'oktober', 'november', 'december']

/** "idag 12:27", "igår 17:42", "i måndags 10:05", "3 okt 09:15", "3 okt 2025 09:15". */
export function relativeWhen(iso: string, now: Date = new Date()): string {
  const s = toStockholm(iso)
  const today = todayInStockholm(now)
  if (s.date === today) return `idag ${s.time}`
  if (s.date === addDays(today, -1)) return `igår ${s.time}`
  if (s.date < today && s.date > addDays(today, -7)) return `${LAST_WEEKDAY[weekdayIndex(s.date)]} ${s.time}`
  const [y, m, d] = s.date.split('-').map(Number)
  const year = String(y) === today.slice(0, 4) ? '' : ` ${y}`
  return `${d} ${MONTH_SHORT[m - 1]}${year} ${s.time}`
}

/** "torsdag 15 oktober 2026 kl. 12:27" — hela tidpunkten, för panelen och verktygstips. */
export function fullWhen(iso: string): string {
  const s = toStockholm(iso)
  const [y, m, d] = s.date.split('-').map(Number)
  return `${WEEKDAY[weekdayIndex(s.date)]} ${d} ${MONTH_LONG[m - 1]} ${y} kl. ${s.time}`
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return ''
  if (seconds < 60) return `${seconds} s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s ? `${m} min ${s} s` : `${m} min`
}

export type OffHours = 'kvall' | 'helg' | null

/** Samtal på vardagar från 17.00 och på lördagar och söndagar, i svensk tid. */
export function offHours(iso: string): OffHours {
  const s = toStockholm(iso)
  if (weekdayIndex(s.date) >= 5) return 'helg'
  if (Number(s.time.slice(0, 2)) >= 17) return 'kvall'
  return null
}

export const OFF_HOURS_LABEL: Record<'kvall' | 'helg', { label: string; hint: string }> = {
  kvall: { label: 'Kväll', hint: 'Efter 17 på en vardag' },
  helg: { label: 'Helg', hint: 'Lördag eller söndag' },
}

// ── Telefonnummer ─────────────────────────────────────────────────────────────

// Landskoder som går att dela av säkert; resten visas med bara "+" före.
const COUNTRY_CODES = ['358', '354', '353', '46', '47', '45', '49', '44', '33', '34', '31', '32', '41', '43', '48', '1']

function groupLocal(rest: string): string {
  if (rest.length === 5) return `${rest.slice(0, 3)} ${rest.slice(3)}`
  if (rest.length === 6) return `${rest.slice(0, 2)} ${rest.slice(2, 4)} ${rest.slice(4)}`
  if (rest.length === 7) return `${rest.slice(0, 3)} ${rest.slice(3, 5)} ${rest.slice(5)}`
  if (rest.length === 8) return `${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`
  return rest
}

/**
 * Ett nummer som det läses bäst: "+46702560622" -> "070-256 06 22",
 * "+46311234567" -> "031-123 45 67". Svenska riktnummer kan vara två till fyra
 * siffror; utan en tabell över dem antas tre (08 undantaget), så en sällsynt
 * fyrsiffrig får fel mellanrum men aldrig fel siffror. Utländska nummer får
 * landskoden avdelad och resten i grupper om tre.
 */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!raw.trim().startsWith('+')) return raw.trim()

  if (digits.startsWith('46') && digits.length >= 9 && digits.length <= 12) {
    const national = `0${digits.slice(2)}`
    if (/^07\d{8}$/.test(national)) {
      return `${national.slice(0, 3)}-${national.slice(3, 6)} ${national.slice(6, 8)} ${national.slice(8)}`
    }
    if (national.startsWith('08')) return `08-${groupLocal(national.slice(2))}`
    return `${national.slice(0, 3)}-${groupLocal(national.slice(3))}`
  }

  const cc = COUNTRY_CODES.find(c => digits.startsWith(c) && digits.length > c.length + 4)
  if (!cc) return `+${digits}`
  return `+${cc} ${digits.slice(cc.length).replace(/(\d{3})(?=\d{2,})/g, '$1 ')}`
}

// ── Sök och filter ────────────────────────────────────────────────────────────

export type TimeFilter = 'alla' | 'idag' | 'vecka'
export type StatusFilter = 'alla' | GroupKey

export interface Filters {
  query: string
  time: TimeFilter
  status: StatusFilter
}

export const NO_FILTERS: Filters = { query: '', time: 'alla', status: 'alla' }

export function filtersActive(f: Filters): boolean {
  return f.query.trim() !== '' || f.time !== 'alla' || f.status !== 'alla'
}

/**
 * Var sökningen träffar: 'kort' när det syns på kortet (namn, nummer,
 * sammanfattning, vad kunden vill, anteckning), 'samtal' när det bara står i
 * transkriptet, null när ingenting matchar. Siffror jämförs mot numret både med
 * +46 och med inledande nolla, så "0702" och "+46702" hittar samma samtal.
 */
export function searchHit(call: PublicCall, query: string): 'kort' | 'samtal' | null {
  const q = query.trim().toLowerCase()
  if (!q) return 'kort'

  const typedDigits = q.replace(/[\s\-+()]/g, '')
  if (/^\d{3,}$/.test(typedDigits) && call.callbackNumber) {
    const own = call.callbackNumber.replace(/\D/g, '')
    const national = own.startsWith('46') ? `0${own.slice(2)}` : own
    if (own.includes(typedDigits) || national.includes(typedDigits)) return 'kort'
  }

  const visible = [
    call.callerName,
    call.summary,
    call.contactNote,
    call.note,
    call.contactRequest ? CONTACT_REQUEST_LABEL[call.contactRequest] : null,
  ]
  if (visible.some(text => text?.toLowerCase().includes(q))) return 'kort'
  if (call.transcript.some(t => t.text.toLowerCase().includes(q))) return 'samtal'
  return null
}

export function inTimeFilter(call: PublicCall, filter: TimeFilter, now: Date = new Date()): boolean {
  if (filter === 'alla') return true
  const day = toStockholm(call.startedAt).date
  const today = todayInStockholm(now)
  if (filter === 'idag') return day === today
  return day >= startOfWeek(today) && day <= today
}

export function applyFilters(calls: PublicCall[], f: Filters, now: Date = new Date()): PublicCall[] {
  return calls.filter(c =>
    inTimeFilter(c, f.time, now)
    && (f.status === 'alla' || groupOf(c.status) === f.status)
    && searchHit(c, f.query) !== null,
  )
}

// ── Siffror ───────────────────────────────────────────────────────────────────

/** Veckans siffror, måndag till idag i svensk tid. Ett nytt ärende = kunden vill bli kontaktad. */
export function weekStats(calls: PublicCall[], now: Date = new Date()): { calls: number; cases: number; offHours: number } {
  const week = calls.filter(c => inTimeFilter(c, 'vecka', now))
  return {
    calls: week.length,
    cases: week.filter(c => c.contactRequest).length,
    offHours: week.filter(c => offHours(c.startedAt)).length,
  }
}

/** Samtal som kom efter förra besöket. Utan tidigare besök finns inget att jämföra med. */
export function newSince(calls: PublicCall[], baseline: string | null): PublicCall[] {
  if (!baseline) return []
  const at = new Date(baseline).getTime()
  return calls.filter(c => new Date(c.startedAt).getTime() > at)
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}
