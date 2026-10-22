import { addDays, fromStockholm, toStockholm, weekdayIndex } from '@/lib/stockholm-time'

// Återuppringningstiden som receptionisten lovar — räknad här i koden, inte av
// modellen. En språkmodell som själv ska räkna ut "nästa vardag" från ett
// datum gissar fel kring helger och röda dagar; det här är en tabell och ett
// par regler.
//
// Används på tre ställen, med samma funktion så att de aldrig kan säga olika:
//   - i prompten: {{ATERUPPRINGNING}} i agentens prompt_text byts mot den
//     talade texten vid varje samtal (fillCallbackPlaceholder)
//   - i BOS och notismejlet: "Utlovad återuppringning: tisdag 21 oktober, 10–16"
//     (promisedCallback), räknat ur samtalets starttid
//   - i sms:et efter samtalet (lib/callback-sms.ts), med samma dag
//
// Dagarna är svenska dagar oavsett var servern står (lib/stockholm-time.ts).
// Fri från imports av servergrejer, så den fungerar i webbläsaren och kan
// testas med vanliga node.

export const CALLBACK_PLACEHOLDER = '{{ATERUPPRINGNING}}'
/** Dagens datum, så att agenten förstår "nästa vecka" och liknande. */
export const TODAY_PLACEHOLDER = '{{IDAG}}'
/**
 * ", och du får ett sms med tiden" när ett sms faktiskt kommer att skickas
 * (lib/callback-sms.ts), annars tom. Tom också där inget nummer finns, som i
 * testsamtalen i webbläsaren — då lovas inget sms.
 */
export const SMS_PLACEHOLDER = '{{SMS_RAD}}'
export const SMS_LINE = ', och du får ett sms med tiden'

const WEEKDAY = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag']
const MONTH = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september',
  'oktober', 'november', 'december']

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/** Påskdagen ett visst år, gregoriansk kalender (Meeus/Jones/Butcher). 'YYYY-MM-DD'. */
export function easterSunday(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return iso(year, month, day)
}

/** Första dagen i intervallet som är en viss veckodag (0 = måndag … 6 = söndag). */
function firstWeekdayFrom(date: string, weekday: number): string {
  let d = date
  while (weekdayIndex(d) !== weekday) d = addDays(d, 1)
  return d
}

const holidayCache = new Map<number, Map<string, string>>()

/**
 * Dagar då kontoret inte ringer, ett visst år: de svenska helgdagarna enligt
 * lag (1989:253), och de tre aftnar som i praktiken är lediga — midsommarafton,
 * julafton och nyårsafton. Annandag pingst är inte helgdag sedan 2005.
 */
export function swedishHolidays(year: number): Map<string, string> {
  const cached = holidayCache.get(year)
  if (cached) return cached
  const easter = easterSunday(year)
  const days = new Map<string, string>([
    [iso(year, 1, 1), 'nyårsdagen'],
    [iso(year, 1, 6), 'trettondedag jul'],
    [addDays(easter, -2), 'långfredagen'],
    [easter, 'påskdagen'],
    [addDays(easter, 1), 'annandag påsk'],
    [iso(year, 5, 1), 'första maj'],
    [addDays(easter, 39), 'Kristi himmelsfärdsdag'],
    [addDays(easter, 49), 'pingstdagen'],
    [iso(year, 6, 6), 'Sveriges nationaldag'],
    [firstWeekdayFrom(iso(year, 6, 19), 4), 'midsommarafton'],
    [firstWeekdayFrom(iso(year, 6, 20), 5), 'midsommardagen'],
    [firstWeekdayFrom(iso(year, 10, 31), 5), 'alla helgons dag'],
    [iso(year, 12, 24), 'julafton'],
    [iso(year, 12, 25), 'juldagen'],
    [iso(year, 12, 26), 'annandag jul'],
    [iso(year, 12, 31), 'nyårsafton'],
  ])
  holidayCache.set(year, days)
  return days
}

/** Måndag–fredag och inte en helgdag eller ledig afton. */
export function isWorkday(date: string): boolean {
  return weekdayIndex(date) < 5 && !swedishHolidays(Number(date.slice(0, 4))).has(date)
}

/**
 * En agents egen återuppringningsregel (agents.callback_rule, 046). Utan regel
 * gäller standardregeln nedan, oförändrad.
 */
export interface CallbackRule {
  /** Arbetsdagens början, 'HH:MM'. */
  workStart: string
  /** Samtal från workStart och före den här tiden får "inom en timme". */
  withinHourUntil: string
  /** Minuter i "inom en timme". */
  withinMinutes: number
  /** "Förmiddag" betyder workStart till den här tiden. */
  morningEnd: string
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** agents.callback_rule som den står i databasen -> regel, eller null om den saknas eller är ogiltig. */
export function parseCallbackRule(raw: unknown): CallbackRule | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const workStart = r.work_start, until = r.within_hour_until, morningEnd = r.morning_end
  const minutes = r.within_minutes ?? 60
  if (typeof workStart !== 'string' || !HHMM.test(workStart)) return null
  if (typeof until !== 'string' || !HHMM.test(until) || until <= workStart) return null
  if (typeof morningEnd !== 'string' || !HHMM.test(morningEnd) || morningEnd <= workStart) return null
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 5 || minutes > 240) return null
  return { workStart, withinHourUntil: until, withinMinutes: minutes, morningEnd }
}

export interface CallbackSlot {
  /** Dagen kontoret ringer, svensk dag 'YYYY-MM-DD'. */
  date: string
  /**
   * Vilket slags löfte: 'day' = standardregelns "mellan klockan 10 och 16",
   * 'morning' = förmiddag, 'within_hour' = inom en timme från samtalet.
   */
  kind: 'day' | 'morning' | 'within_hour'
  /** Löftet har passerats efter den här tidpunkten (ISO). */
  deadline: string
  /** true = ett förmiddagslöfte; false = mellan klockan 10 och 16, eller inom en timme. */
  morning: boolean
  /** Dagen utskriven: "tisdag 21 oktober". Samma i BOS, mejlet och sms:et. */
  day: string
  /** Det receptionisten säger: "imorgon, tisdag, mellan klockan 10 och 16". */
  spoken: string
  /** Det BOS och notismejlet visar: "tisdag 21 oktober, 10–16" eller "senast 14:35". */
  label: string
}

/**
 * När kontoret ringer tillbaka på ett samtal som börjar vid `startedAt`:
 * nästa vardag efter samtalsdagen, i svensk tid.
 *
 *   - Nästa vardag är en måndag efter en helg: "på måndag förmiddag". Det
 *     gäller samtal på fredag, lördag och söndag, och samtal före en röd fredag.
 *   - Samtal måndag–torsdag när dagen efter är en vardag:
 *     "imorgon, tisdag, mellan klockan 10 och 16".
 *   - Ligger en helgdag emellan: "på fredag mellan klockan 10 och 16".
 */
export function callbackSlot(startedAt: Date | string, rule: CallbackRule | null = null): CallbackSlot {
  if (rule) return ruleSlot(startedAt, rule)
  const callDay = toStockholm(startedAt).date
  let date = addDays(callDay, 1)
  while (!isWorkday(date)) date = addDays(date, 1)

  const weekday = weekdayIndex(date)
  const morning = weekday === 0
  const tomorrow = date === addDays(callDay, 1) && weekdayIndex(callDay) <= 3

  const spoken = morning
    ? 'på måndag förmiddag'
    : tomorrow
      ? `imorgon, ${WEEKDAY[weekday]}, mellan klockan 10 och 16`
      : `på ${WEEKDAY[weekday]} mellan klockan 10 och 16`

  const day = dayText(date)
  const label = `${day}, ${morning ? 'förmiddag' : '10–16'}`
  const deadline = fromStockholm(date, morning ? '12:00' : '16:00').toISOString()
  return { date, kind: morning ? 'morning' : 'day', deadline, morning, day, spoken, label }
}

function dayText(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${WEEKDAY[weekdayIndex(date)]} ${d} ${MONTH[m - 1]}`
}

/**
 * Regeln med "inom en timme" (agents.callback_rule), i svensk tid:
 *   - vardag, från workStart och före withinHourUntil: "inom en timme",
 *     deadline = samtalets start + withinMinutes
 *   - vardag före workStart: "idag på förmiddagen"
 *   - annars (vardag från withinHourUntil, lördag, söndag, röd dag): nästa
 *     vardag på förmiddagen — "imorgon förmiddag" om det är dagen efter,
 *     "på måndag förmiddag" efter en helg, annars "på [veckodag] förmiddag"
 * Förmiddagslöften passeras vid morningEnd den dagen.
 */
function ruleSlot(startedAt: Date | string, rule: CallbackRule): CallbackSlot {
  const at = typeof startedAt === 'string' ? new Date(startedAt) : startedAt
  const { date: callDay, time } = toStockholm(at)

  if (isWorkday(callDay) && time >= rule.workStart && time < rule.withinHourUntil) {
    const deadline = new Date(at.getTime() + rule.withinMinutes * 60_000)
    const latest = toStockholm(deadline).time
    const spoken = rule.withinMinutes === 60 ? 'inom en timme' : `inom ${rule.withinMinutes} minuter`
    return { date: callDay, kind: 'within_hour', deadline: deadline.toISOString(), morning: false,
      day: dayText(callDay), spoken, label: `senast ${latest}` }
  }

  let date: string
  let spoken: string
  if (isWorkday(callDay) && time < rule.workStart) {
    date = callDay
    spoken = 'idag på förmiddagen'
  } else {
    date = addDays(callDay, 1)
    while (!isWorkday(date)) date = addDays(date, 1)
    const afterWeekend = weekdayIndex(date) === 0 && date !== addDays(callDay, 1)
    spoken = date === addDays(callDay, 1)
      ? 'imorgon förmiddag'
      : afterWeekend ? 'på måndag förmiddag' : `på ${WEEKDAY[weekdayIndex(date)]} förmiddag`
  }
  const day = dayText(date)
  return { date, kind: 'morning', deadline: fromStockholm(date, rule.morningEnd).toISOString(), morning: true,
    day, spoken, label: `${day}, förmiddag` }
}

/**
 * Agentens prompt med {{ATERUPPRINGNING}} utbytt mot tiden för ett samtal som
 * börjar vid `startedAt`, {{IDAG}} mot samtalsdagen ("måndag 19 oktober
 * 2026") och {{SMS_RAD}} mot SMS_LINE när `sms` är sant, annars tomt. Utan
 * platshållare kommer exakt samma text tillbaka — så alla andra agenters
 * prompter är tecken för tecken oförändrade.
 */
export function fillCallbackPlaceholder(
  prompt: string,
  startedAt: Date | string = new Date(),
  { sms = false, rule = null }: { sms?: boolean; rule?: CallbackRule | null } = {},
): string {
  let out = prompt
  if (out.includes(CALLBACK_PLACEHOLDER)) out = out.split(CALLBACK_PLACEHOLDER).join(callbackSlot(startedAt, rule).spoken)
  if (out.includes(TODAY_PLACEHOLDER)) out = out.split(TODAY_PLACEHOLDER).join(todayText(startedAt))
  if (out.includes(SMS_PLACEHOLDER)) out = out.split(SMS_PLACEHOLDER).join(sms ? SMS_LINE : '')
  return out
}

/** "måndag 19 oktober 2026" — samtalsdagen i svensk tid, för {{IDAG}}. */
export function todayText(startedAt: Date | string): string {
  const date = toStockholm(startedAt).date
  const [y, m, d] = date.split('-').map(Number)
  return `${WEEKDAY[weekdayIndex(date)]} ${d} ${MONTH[m - 1]} ${y}`
}

/**
 * Den återuppringning receptionisten faktiskt lovade, eller null.
 *
 * Tiden räknas ur samtalets starttid med callbackSlot(), som i prompten. Men
 * den visas bara när receptionisten också sa den: ett samtal som bröts innan
 * avslutet fick inget löfte, och ett samtal från innan agenten fick
 * platshållaren fick ett annat. Siffrorna godtas både som "10 och 16" och som
 * ord, eftersom rösten ibland skriver ut dem.
 */
export function promisedCallback(
  startedAt: string,
  turns: { speaker: string; text: string }[],
  rule: CallbackRule | null = null,
): CallbackSlot | null {
  const slot = callbackSlot(startedAt, rule)
  const said = turns
    .filter(t => t.speaker === 'receptionist')
    .map(t => t.text.toLowerCase())
    .join(' ')
  if (slot.kind === 'within_hour') return WITHIN_HOUR.test(said) ? slot : null
  if (rule) {
    // "imorgon förmiddag", "idag på förmiddagen", "på torsdag förmiddag".
    if (!said.includes('förmiddag')) return null
    const today = toStockholm(startedAt).date
    const ok = said.includes(WEEKDAY[weekdayIndex(slot.date)])
      || (slot.date === addDays(today, 1) && said.includes('imorgon'))
      || (slot.date === today && said.includes('idag'))
    return ok ? slot : null
  }
  if (!said.includes(WEEKDAY[weekdayIndex(slot.date)])) return null
  if (slot.morning) return said.includes('förmiddag') ? slot : null
  return TEN.test(said) && SIXTEEN.test(said) ? slot : null
}

/** "inom en timme", "inom 1 timme", "inom en timma". */
const WITHIN_HOUR = /inom (?:en|1|ett) timm?[ea]/u

// Hela tal eller hela ord: "tio" får inte träffa "trettio" eller "station".
const TEN = /(?<![\p{L}\p{N}])(?:10|tio)(?![\p{L}\p{N}])/u
const SIXTEEN = /(?<![\p{L}\p{N}])(?:16|sexton)(?![\p{L}\p{N}])/u
