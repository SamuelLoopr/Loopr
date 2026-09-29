import { parseTranscript, type Speaker } from '@/lib/call-transcript'
import { maskPhone, redactPii } from '@/lib/redact'

// What one call looks like once it leaves the server for the public Master Demo
// / BOS page. The route builds it (toPublicCall); the page imports only the
// types.
//
// Everything a visitor with the link can see is decided here, so the rule is
// allow-listing: only the fields below are ever copied from a call_logs row. No
// ids of any kind (call, agent, lead), no error_message, no cost, no to_number.

export type PublicContactRequest = 'meeting' | 'quote' | 'callback'

export interface PublicCall {
  startedAt: string
  durationSec: number | null
  summary: string
  contactRequest: PublicContactRequest | null
  contactNote: string | null
  /** Masked — see lib/redact.ts. */
  caller: string
  /**
   * The caller's full number. Only ever present on a contact request, and only
   * when SHOW_FULL_NUMBER_ON_CONTACT_REQUESTS is switched on in the route.
   */
  callbackNumber?: string
  transcript: { speaker: Speaker; text: string }[]
}

export interface PublicCallsResponse {
  calls: PublicCall[]
  /** Calls ElevenLabs is still processing; they appear once finished. */
  processing: number
}

export interface CallRow {
  created_at: string
  duration_sec: number | null
  summary: string | null
  transcript: string | null
  from_number: string | null
  contact_request?: string | null
  contact_note?: string | null
}

const REQUESTS: readonly PublicContactRequest[] = ['meeting', 'quote', 'callback']

export function toPublicCall(row: CallRow, opts: { showFullNumberOnRequest: boolean }): PublicCall {
  const transcript = parseTranscript(row.transcript).map(t => ({
    speaker: t.speaker,
    text: redactPii(t.text),
  }))

  const request = REQUESTS.find(r => r === row.contact_request) ?? null

  return {
    startedAt: row.created_at,
    durationSec: row.duration_sec ?? null,
    summary: row.summary ? redactPii(row.summary) : fallbackSummary(transcript),
    contactRequest: request,
    contactNote: request && row.contact_note ? redactPii(row.contact_note) : null,
    caller: maskPhone(row.from_number),
    ...(opts.showFullNumberOnRequest && request && row.from_number
      ? { callbackNumber: row.from_number }
      : {}),
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
