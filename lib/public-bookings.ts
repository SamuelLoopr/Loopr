// What one booking looks like once it leaves the server for the public BOS page
// (/master/[shareId]). The routes build it (toPublicBooking); the page imports
// only the types.
//
// Allow-listed like the calls payload (lib/public-calls.ts): id, agent_id and
// call_log_id never leave the server. The booking is named by its own
// public_ref, and the call it came from by that call's public_ref.

export interface PublicBooking {
  ref: string
  title: string
  startsAt: string
  endsAt: string
  callerName: string | null
  note: string | null
  /** public_ref of the call the booking was made from, or null. */
  callRef: string | null
}

export interface PublicBookingsResponse {
  bookings: PublicBooking[]
  /** Whether bookings can be created and changed here (needs 029 and client mode). */
  editable: boolean
}

/** What the create route accepts; the update route takes the same minus callRef. */
export interface BookingInput {
  title: string
  startsAt: string
  endsAt: string
  callerName?: string | null
  note?: string | null
  callRef?: string | null
}

export interface BookingRow {
  public_ref: string
  title: string
  starts_at: string
  ends_at: string
  caller_name: string | null
  note: string | null
  call_log_id: string | null
}

/** Only the columns a public booking is built from. */
export const BOOKING_COLS = 'public_ref, title, starts_at, ends_at, caller_name, note, call_log_id'

/**
 * @param callRefById call_logs.id -> call_logs.public_ref for this agent's calls;
 *                    the internal id is used only to look the ref up.
 */
export function toPublicBooking(row: BookingRow, callRefById: Map<string, string>): PublicBooking {
  return {
    ref: row.public_ref,
    title: row.title,
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    callerName: row.caller_name,
    note: row.note,
    callRef: row.call_log_id ? callRefById.get(row.call_log_id) ?? null : null,
  }
}
