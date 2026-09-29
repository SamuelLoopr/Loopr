import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { isMissingTable } from '@/lib/db-errors'
import { parseBookingUpdate, type BookingFields } from '@/lib/booking-rules'
import { BOOKING_COLS, toPublicBooking, type BookingRow } from '@/lib/public-bookings'
import {
  MAX_BODY_BYTES, REF_PATTERN, badRequest, callRefsFor, isCheckViolation, notEnabled, notFound, reply,
  resolveBookingAgent,
} from '@/lib/bookings-server'

// One booking in the client's calendar: PATCH edits it, DELETE removes it.
//
// SECURITY — the same pattern as the call status route (../../calls/[ref]):
//  - The share id resolves to exactly one agent, in client mode only.
//  - The booking is named by its public_ref, and every read and write is
//    filtered on public_ref AND agent_id AND not deleted, in one statement. A
//    ref from another client's calendar, a guessed ref and an already deleted
//    booking all match no row and get the same 404 — the response never says
//    whether a ref exists somewhere else.
//  - The body is allow-listed (lib/booking-rules.ts). Which call a booking came
//    from cannot be changed, and no id or owner column can be reached.
//  - DELETE is a soft delete (deleted_at): the link is a bearer key with no
//    login behind it, so a booking removed through it can still be restored.

const bookingRef = (ref: string) => REF_PATTERN.test(ref)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ shareId: string; ref: string }> },
) {
  const { shareId, ref } = await params
  if (!bookingRef(ref)) return notFound('Bokningen')

  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return reply({ error: 'Förfrågan är för stor.' }, 413)
  }

  const supabase = createSupabaseServiceClient()
  const agent = await resolveBookingAgent(supabase, shareId)
  if (!agent) return notFound()

  // The booking as it stands — needed to check a new start against the old
  // end and vice versa.
  const { data: current, error: readError } = await supabase
    .from('bos_bookings')
    .select(BOOKING_COLS)
    .eq('public_ref', ref)
    .eq('agent_id', agent.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (readError) {
    if (isMissingTable(readError)) return notEnabled()
    console.error('[public-agent/bookings/ref] Kunde inte läsa:', readError.message)
    return reply({ error: 'Bokningen kunde inte hämtas just nu.' }, 500)
  }
  if (!current) return notFound('Bokningen')

  const row = current as BookingRow
  const fields: BookingFields = {
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    callerName: row.caller_name,
    note: row.note,
  }

  const body: unknown = await req.json().catch(() => undefined)
  const checked = parseBookingUpdate(body, fields, new Date())
  if (!checked.ok) return badRequest(checked.error)

  const { patch } = checked.value
  const update: Record<string, string | null> = { updated_at: new Date().toISOString() }
  if (patch.title !== undefined) update.title = patch.title
  if (patch.startsAt !== undefined) update.starts_at = patch.startsAt
  if (patch.endsAt !== undefined) update.ends_at = patch.endsAt
  if (patch.callerName !== undefined) update.caller_name = patch.callerName
  if (patch.note !== undefined) update.note = patch.note

  const { data: updated, error } = await supabase
    .from('bos_bookings')
    .update(update)
    .eq('public_ref', ref)
    .eq('agent_id', agent.id)
    .is('deleted_at', null)
    .select(BOOKING_COLS)
    .maybeSingle()

  if (error) {
    if (isCheckViolation(error)) return badRequest('Bokningen är ogiltig.')
    console.error('[public-agent/bookings/ref] Kunde inte spara:', error.message)
    return reply({ error: 'Bokningen kunde inte sparas just nu.' }, 500)
  }
  if (!updated) return notFound('Bokningen')

  const saved = updated as BookingRow
  const callRefById = await callRefsFor(supabase, agent.id, [saved.call_log_id])
  return reply({ booking: toPublicBooking(saved, callRefById) })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ shareId: string; ref: string }> },
) {
  const { shareId, ref } = await params
  if (!bookingRef(ref)) return notFound('Bokningen')

  const supabase = createSupabaseServiceClient()
  const agent = await resolveBookingAgent(supabase, shareId)
  if (!agent) return notFound()

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('bos_bookings')
    .update({ deleted_at: now, updated_at: now })
    .eq('public_ref', ref)
    .eq('agent_id', agent.id)
    .is('deleted_at', null)
    .select('public_ref')
    .maybeSingle()

  if (error) {
    if (isMissingTable(error)) return notEnabled()
    console.error('[public-agent/bookings/ref] Kunde inte ta bort:', error.message)
    return reply({ error: 'Bokningen kunde inte tas bort just nu.' }, 500)
  }
  if (!data) return notFound('Bokningen')

  return reply({ ok: true })
}
