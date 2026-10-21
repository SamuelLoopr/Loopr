import type { SupabaseClient } from '@supabase/supabase-js'
import { fromStockholm } from '@/lib/stockholm-time'
import { SMS_PLACEHOLDER, type CallbackSlot } from '@/lib/callback-time'

// Sms-bekräftelsen av återuppringningen: vem den går till, vad den säger och
// när den får skickas. Ren logik, så den går att testa med node — utom
// promiseSms() längst ner, som samtalsroutarna använder och som läser en rad.
// Utskicket görs av lib/call-sms.ts.

/**
 * Ett svenskt mobilnummer i E.164 (+467…), eller null.
 *
 * Mobilserierna 070, 072, 073, 076 och 079. 071 och 074 är maskin-till-maskin
 * och tar inte emot vanliga sms; fasta nummer, dolda nummer och utländska
 * nummer ger null.
 */
export function swedishMobile(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim().replace(/[\s\-()]/g, '')
  const e164 = text.startsWith('+') ? text
    : text.startsWith('0046') ? `+${text.slice(2)}`
    : /^07\d{8}$/.test(text) ? `+46${text.slice(1)}`
    : text
  return /^\+467[02369]\d{7}$/.test(e164) ? e164 : null
}

/**
 * Numret sms:et skickas till: återuppringningsnumret om det är ett svenskt
 * mobilnummer, annars mobilnumret samtalet kom från. Ger kunden ett fast nummer
 * att bli uppringd på får sms:et alltså ändå mobilen de ringde från — det var
 * det numret prompten lovade ett sms till.
 */
export function smsRecipient(callbackNumber: string | null | undefined, fromNumber: string | null | undefined): string | null {
  return swedishMobile(callbackNumber) ?? swedishMobile(fromNumber)
}

/**
 * Förnamnet ur namnet analysen plockade ut, eller null. Bara ett ord av
 * bokstäver (och bindestreck), så att ett företagsnamn eller något konstigt
 * aldrig hamnar i ett sms som ett tilltal.
 */
export function firstName(callerName: string | null | undefined): string | null {
  const first = (callerName ?? '').trim().split(/\s+/)[0] ?? ''
  if (!/^\p{L}{2,}(?:-\p{L}{2,})?$/u.test(first) || first.length > 20) return null
  // "anna" och "per-olof" som transkriptet skrev dem blir "Anna" och "Per-Olof".
  return first.split('-').map(p => p[0].toLocaleUpperCase('sv') + p.slice(1)).join('-')
}

/**
 * "Tack för ditt samtal till Veteranpoolen Norr, Anna! En av våra experter
 * ringer dig onsdag 22 oktober mellan 10 och 16. Du behöver inte göra något
 * mer." Efter en helg: "… ringer dig måndag 26 oktober på förmiddagen. …".
 * Dagen är slot.day, samma text som BOS och mejlet visar.
 */
export function callbackSmsText(businessName: string, name: string | null, slot: CallbackSlot): string {
  const greeting = name ? `${businessName}, ${name}` : businessName
  const when = slot.morning ? `${slot.day} på förmiddagen` : `${slot.day} mellan 10 och 16`
  return `Tack för ditt samtal till ${greeting}! En av våra experter ringer dig ${when}. Du behöver inte göra något mer.`
}

/** Hur gammalt ett samtal får vara när sms:et skickas. */
export const SMS_MAX_AGE_MS = 12 * 60 * 60 * 1000

/**
 * Får sms:et skickas nu? Bara strax efter samtalet, och aldrig samma dag som
 * återuppringningen: analysen körs också vid sidladdning i BOS, och ett samtal
 * som webhooken missade ska inte få ett sms om "onsdag" när det redan är
 * onsdag morgon. Gränsen är klockan 08 den dagen kontoret ringer.
 */
export function smsStillTimely(startedAt: string, slot: CallbackSlot, now: Date = new Date()): boolean {
  const age = now.getTime() - new Date(startedAt).getTime()
  return age >= 0 && age <= SMS_MAX_AGE_MS && now < fromStockholm(slot.date, '08:00')
}

/**
 * Pengabelopp i en text: "500 kr", "1 200 kronor", "350:-", "SEK 99". Sms:et
 * byggs av en fast mall och ska aldrig innehålla något sådant; det här är
 * bakkantsskyddet om ett namn eller ett företagsnamn skulle bära ett.
 */
export function mentionsPrice(text: string): boolean {
  return /\d[\d\s.,]*\s*(?:kr\b|kronor|:-|sek\b)|\bsek\s*\d/iu.test(text)
}

/**
 * Ska {{SMS_RAD}} lova ett sms i det här samtalet? Vid samtalets början, på
 * både Twilio- och SIP-vägen. Samma villkor som utskicket, så långt det går
 * att veta innan samtalet hänt: agenten skickar sms och den som ringer har ett
 * svenskt mobilnummer.
 *
 * Bara när prompten har platshållaren frågas databasen; för alla andra agenter
 * blir det ingen extra läsning. Varje fel ger false: hellre inget löfte om sms
 * än ett som inte hålls.
 */
export async function promiseSms(
  supabase: SupabaseClient,
  agentId: string,
  promptText: string | null,
  callerNumber: string | null,
): Promise<boolean> {
  if (!promptText?.includes(SMS_PLACEHOLDER)) return false
  if (!swedishMobile(callerNumber)) return false
  const { data, error } = await supabase.from('agents').select('sms_enabled, sms_sender').eq('id', agentId).maybeSingle()
  if (error || !data) return false
  return data.sms_enabled === true && Boolean(data.sms_sender)
}
