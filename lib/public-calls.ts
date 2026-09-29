import { parseTranscript, type Speaker } from '@/lib/call-transcript'
import { clientStatusOf, type ClientStatus } from '@/lib/client-status'
import { maskPhone, redactPii } from '@/lib/redact'

// What one call looks like once it leaves the server for the public BOS page
// (/master/[shareId]). The route builds it (toPublicCall); the page imports only
// the types.
//
// Everything a visitor with the link can see is decided here, so the rule is
// allow-listing: only the fields below are ever copied from a call_logs row. No
// internal ids of any kind (call, agent, lead, user), no error_message, no cost,
// no to_number.

export type PublicContactRequest = 'meeting' | 'quote' | 'callback'

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
  /** Masked — see lib/redact.ts. */
  caller: string
  /**
   * The caller's full number. Only ever present on a contact request, and only
   * when SHOW_FULL_NUMBER_ON_CONTACT_REQUESTS is switched on in the route.
   */
  callbackNumber?: string
  /** Set by the client on this page. */
  status: ClientStatus
  /** The client's own note, shown exactly as they wrote it. */
  note: string | null
  transcript: { speaker: Speaker; text: string }[]
}

export interface PublicCallsResponse {
  calls: PublicCall[]
  /** Calls ElevenLabs is still processing; they appear once finished. */
  processing: number
  /** Whether status and notes can be changed here (needs 028_bos_client_crm). */
  editable: boolean
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
}

const REQUESTS: readonly PublicContactRequest[] = ['meeting', 'quote', 'callback']

export function toPublicCall(row: CallRow, opts: { showFullNumberOnRequest: boolean }): PublicCall {
  const transcript = parseTranscript(row.transcript).map(t => ({
    speaker: t.speaker,
    text: redactPii(t.text),
  }))

  const request = REQUESTS.find(r => r === row.contact_request) ?? null

  return {
    ref: row.public_ref ?? null,
    startedAt: row.created_at,
    durationSec: row.duration_sec ?? null,
    summary: row.summary ? redactPii(row.summary) : fallbackSummary(transcript),
    contactRequest: request,
    contactNote: request && row.contact_note ? redactPii(row.contact_note) : null,
    // Already cleaned when it was extracted; redacted again here because this
    // is the last point before the page, whatever wrote the column.
    callerName: row.caller_name ? redactPii(row.caller_name) : null,
    caller: maskPhone(row.from_number),
    ...(opts.showFullNumberOnRequest && request && row.from_number
      ? { callbackNumber: row.from_number }
      : {}),
    status: clientStatusOf(row.client_status),
    note: row.client_note ?? null,
    transcript,
  }
}

/**
 * Until Claude has written a summary (or when it cannot be reached), show what
 * the caller opened with rather than an empty line.
 */
function fallbackSummary(transcript: PublicCall['transcript']): string {
  const first = transcript.find(t => t.speaker !== 'receptionist')?.text
  if (!first) return 'Den som ringde lade på utan att säga något.'
  const clipped = first.length > 140 ? `${first.slice(0, 137).trimEnd()}…` : first
  return `Kunden sa: ”${clipped}”`
}
