import { parseTranscript, type Speaker } from '@/lib/call-transcript'
import { clientStatusOf, type ClientStatus } from '@/lib/client-status'
import type { PublicBooking } from '@/lib/public-bookings'
import { maskPhone, redactPii } from '@/lib/redact'
import { promisedCallback, type CallbackRule } from '@/lib/callback-time'

// What one call looks like once it leaves the server for the public BOS page
// (/master/[shareId]). The route builds it (toPublicCall); the page imports only
// the types.
//
// Everything a visitor with the link can see is decided here, so the rule is
// allow-listing: only the fields below are ever copied from a call_logs row. No
// internal ids of any kind (call, agent, lead, user), no error_message, no cost,
// no to_number.

export type PublicContactRequest = 'meeting' | 'quote' | 'callback'

/** Vad förfrågan kallas för klienten. Delas av samtalskortet och notis-mejlet. */
export const CONTACT_REQUEST_LABEL: Record<PublicContactRequest, string> = {
  quote: 'Offert',
  meeting: 'Möte',
  callback: 'Återkoppling',
}

export interface PublicCall {
  /**
   * The call's public_ref (028_bos_client_crm.sql): a random handle whose only
   * use is naming this call in the page's write requests — and only together
   * with the share id it was served under. Null before 028 has run, which makes
   * the call read-only.
   */
  ref: string | null
  startedAt: string
  durationSec: number | null
  summary: string
  contactRequest: PublicContactRequest | null
  contactNote: string | null
  /** As the caller introduced themselves, if they did. */
  callerName: string | null
  /**
   * Numret som det ska visas: hela numret på en klients sida, maskerat på en
   * säljdemo (lib/redact.ts).
   */
  caller: string
  /**
   * Samma nummer i ringbart skick, satt bara när det visas omaskerat. Sidan
   * använder det till tel:-länkar.
   */
  callbackNumber?: string
  /**
   * Numret den som ringde själv gav för att bli uppringd (call_logs.callback_number,
   * 042) — "Ring upp på". Bara i klientläge, och bara när det inte är samma
   * nummer som samtalet kom från.
   */
  givenNumber?: string
  /**
   * Återuppringningen receptionisten lovade i samtalet, t.ex. "tisdag 21
   * oktober, 10–16" (lib/callback-time.ts). Bara för agenter vars prompt lovar
   * en tid, och bara när receptionisten faktiskt sa den.
   */
  promisedCallback?: string
  /**
   * När löftet passeras (ISO): deadline för "inom en timme", annars slutet på
   * den utlovade förmiddagen eller dagen. Sidan varnar efter den tiden om
   * ärendet fortfarande är nytt.
   */
  promisedCallbackDeadline?: string
  /**
   * Sms-bekräftelsen efter samtalet och svar på den (043, lib/call-sms.ts).
   * Bara i klientläge och bara för agenter som skickar sms.
   */
  sms?: PublicSms
  /** Set by the client on this page. */
  status: ClientStatus
  /** The client's own note, shown exactly as they wrote it. */
  note: string | null
  /** Calendar bookings made from this call (client mode only). */
  bookings: PublicBooking[]
  transcript: { speaker: Speaker; text: string }[]
}

export interface PublicSms {
  /** När 46elks tog emot sms:et; null när det inte skickades. */
  sentAt: string | null
  /** Ett utskick försöktes men gick inte. */
  failed: boolean
  /** Svar som kommit in på sms:et, äldst först. */
  replies: { at: string; text: string }[]
}

export interface PublicCallsResponse {
  calls: PublicCall[]
  /** Calls ElevenLabs is still processing; they appear once finished. */
  processing: number
  /** Whether status and notes can be changed here (needs 028_bos_client_crm). */
  editable: boolean
  /** Whether calls can be booked into the client's calendar (needs 029 and client mode). */
  bookingsEnabled: boolean
}

/** What the page's write route accepts back and returns. */
export interface PublicCallUpdate {
  status?: ClientStatus
  note?: string | null
}

export interface CallRow {
  created_at: string
  duration_sec: number | null
  summary: string | null
  transcript: string | null
  from_number: string | null
  contact_request?: string | null
  contact_note?: string | null
  public_ref?: string | null
  caller_name?: string | null
  client_status?: string | null
  client_note?: string | null
  callback_number?: string | null
}

const REQUESTS: readonly PublicContactRequest[] = ['meeting', 'quote', 'callback']

// Vad Twilio skickar som avsändare när numret är dolt: "ANONYMOUS",
// "RESTRICTED", "BLOCKED", "UNKNOWN" och "UNAVAILABLE" inslaget på en
// telefonknappsats. De ser ut som nummer men går inte att ringa.
const WITHHELD = new Set(['266696687', '7378742833', '2562533', '8656696', '86282452253'])

/**
 * Numret i ringbart skick, eller null när det inte går att ringa: saknas, är
 * dolt ("anonymous", Twilios platshållare ovan) eller är för kort för att vara
 * ett abonnentnummer.
 */
export function dialableNumber(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim()
  const digits = text.replace(/\D/g, '')
  if (digits.length < 7 || WITHHELD.has(digits)) return null
  if (text.startsWith('+')) return `+${digits}`
  if (text.startsWith('00')) return `+${digits.slice(2)}`
  return digits
}

export function toPublicCall(
  row: CallRow,
  opts: {
    /**
     * Visa hela telefonnumret. Sant bara i klientläge: sidan är då företagets
     * egen arbetsyta och numret finns där för att kunna ringas upp. På en
     * säljdemo, som kan visas för vem som helst, maskeras det i stället.
     */
    revealNumber: boolean
    bookings?: PublicBooking[]
    /**
     * Hälsofiltret från samtalsanalysen (mentionsHealth i lib/call-insights.ts).
     * Skickas in av routen i stället för att importeras här: den här filen
     * importeras också av sidan i webbläsaren, och lib/call-insights.ts drar
     * med sig Anthropics SDK.
     */
    mentionsHealth: (text: string) => boolean
    /** Agentens prompt lovar en återuppringningstid ({{ATERUPPRINGNING}}). */
    promisesCallback?: boolean
    /** Agentens återuppringningsregel (046); null = standardregeln. */
    callbackRule?: CallbackRule | null
    /** Sms-utfallet för samtalet, bara när routen satt det (klientläge, sms på). */
    sms?: PublicSms
  },
): PublicCall {
  const transcript = parseTranscript(row.transcript).map(t => ({
    speaker: t.speaker,
    text: redactPii(t.text),
  }))

  const request = REQUESTS.find(r => r === row.contact_request) ?? null
  const callable = opts.revealNumber ? dialableNumber(row.from_number) : null
  const given = opts.revealNumber ? dialableNumber(row.callback_number) : null
  const promise = opts.promisesCallback ? promisedCallback(row.created_at, transcript, opts.callbackRule ?? null) : null

  return {
    ref: row.public_ref ?? null,
    startedAt: row.created_at,
    durationSec: row.duration_sec ?? null,
    summary: row.summary ? redactPii(row.summary) : fallbackSummary(transcript, opts.mentionsHealth),
    contactRequest: request,
    contactNote: request && row.contact_note ? redactPii(row.contact_note) : null,
    // Already cleaned when it was extracted; redacted again here because this
    // is the last point before the page, whatever wrote the column.
    callerName: row.caller_name ? redactPii(row.caller_name) : null,
    // Ett dolt nummer visas som "Dolt nummer" även i klientläge, och får inget
    // ringbart nummer: sidan varnar då i stället för att erbjuda en tel:-länk.
    caller: callable ?? (opts.revealNumber ? 'Dolt nummer' : maskPhone(row.from_number)),
    ...(callable ? { callbackNumber: callable } : {}),
    ...(given && given !== callable ? { givenNumber: given } : {}),
    ...(promise ? { promisedCallback: promise.label, promisedCallbackDeadline: promise.deadline } : {}),
    ...(opts.sms ? { sms: { ...opts.sms, replies: opts.sms.replies.map(r => ({ at: r.at, text: redactPii(r.text) })) } } : {}),
    status: clientStatusOf(row.client_status),
    note: row.client_note ?? null,
    bookings: opts.bookings ?? [],
    transcript,
  }
}

/**
 * Until Claude has written a summary (or when it cannot be reached), show what
 * the caller opened with rather than an empty line.
 *
 * Det är kundens egna ord, ofiltrerade — så de går genom samma hälsofilter som
 * sammanfattningarna innan de visas. Hela repliken prövas, inte bara den
 * avkortade biten, så att ett ord som klipps mitt itu ändå fångas.
 */
function fallbackSummary(transcript: PublicCall['transcript'], mentionsHealth: (text: string) => boolean): string {
  const first = transcript.find(t => t.speaker !== 'receptionist')?.text
  if (!first) return 'Den som ringde lade på utan att säga något.'
  if (mentionsHealth(first)) return 'Kunden ringde om något som gäller omsorg.'
  const clipped = first.length > 140 ? `${first.slice(0, 137).trimEnd()}…` : first
  return `Kunden sa: ”${clipped}”`
}
