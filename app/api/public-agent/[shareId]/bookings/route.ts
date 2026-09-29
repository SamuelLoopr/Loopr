import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { isMissingTable } from '@/lib/db-errors'
import { parseBookingCreate, parseInstantParam } from '@/lib/booking-rules'
import { BOOKING_COLS, toPublicBooking, type BookingRow } from '@/lib/public-bookings'
import {
  MAX_BODY_BYTES, badRequest, callRefsFor, isCheckViolation, notEnabled, notFound, reply, resolveBookingAgent,
} from '@/lib/bookings-server'

// The client's calendar on their BOS page (/master/[shareId]), client mode only.
//   GET  ?from=&to=  the live bookings overlapping a time window
//   POST             create a booking — optionally from one of the client's calls
// Editing and deleting one booking: ./[ref]/route.ts.
//
// SECURITY — the same pattern as the call status route:
//  - The share id resolves to exactly one agent on the server, and only when its
//    page is in client mode (lib/bookings-server.ts). Every query is filtered on
//    that agent's id; the id never appears in a response.
//  - A booking made from a call names the call by its public_ref. The call is
//    looked up by that ref AND this agent AND status 'completed' — a ref taken
//    from another client's page matches nothing and the create is refused.
//  - The body is allow-listed and validated in lib/booking-rules.ts: unknown
//    keys are refused, times must be in order, at most 12 hours long and within
//    a year back / two years ahead. The database repeats the invariant rules.
//  - Responses carry bookings only as toPublicBooking() builds them: public_ref,
//    never id, agent_id or call_log_id.
//  - bos_bookings is closed to the anon role (029); this route runs on the
//    service role and does all scoping itself.

const DAY_MS = 86_400_000
// The page asks for one month grid (six weeks) at a time; this caps the query.
const MAX_WINDOW_DAYS = 100
const MAX_LISTED = 500
// A leaked link must not be able to fill a client's calendar without limit.
const MAX_UPCOMING = 1000

export async function GET(req: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  const supabase = createSupabaseServiceClient()

  const agent = await resolveBookingAgent(supabase, shareId)
  if (!agent) return notFound()

  const now = Date.now()
  const fromParam = req.nextUrl.searchParams.get('from')
  const toParam = req.nextUrl.searchParams.get('to')
  const from = fromParam ? parseInstantParam(fromParam) : new Date(now - 7 * DAY_MS)
  const to = toParam ? parseInstantParam(toParam) : new Date(now + 60 * DAY_MS)
  if (!from || !to || to <= from || to.getTime() - from.getTime() > MAX_WINDOW_DAYS * DAY_MS) {
    return badRequest('Ogiltigt tidsintervall.')
  }

  // Everything that overlaps the window, so a booking crossing midnight at the
  // edge of the grid is not lost.
  const { data, error } = await supabase
    .from('bos_bookings')
    .select(BOOKING_COLS)
    .eq('agent_id', agent.id)
    .is('deleted_at', null)
    .lt('starts_at', to.toISOString())
    .gt('ends_at', from.toISOString())
    .order('starts_at', { ascending: true })
    .limit(MAX_LISTED)

  if (error) {
    if (isMissingTable(error)) return reply({ bookings: [], editable: false })
    console.error('[public-agent/bookings] Kunde inte läsa:', error.message)
    return reply({ error: 'Kalendern kunde inte hämtas just nu.' }, 500)
  }

  const rows = (data ?? []) as BookingRow[]
  const callRefById = await callRefsFor(supabase, agent.id, rows.map(r => r.call_log_id))
  return reply({ bookings: rows.map(r => toPublicBooking(r, callRefById)), editable: true })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params

  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return reply({ error: 'Förfrågan är för stor.' }, 413)
  }

  const supabase = createSupabaseServiceClient()
  const agent = await resolveBookingAgent(supabase, shareId)
  if (!agent) return notFound()

  const body: unknown = await req.json().catch(() => undefined)
  const checked = parseBookingCreate(body, new Date())
  if (!checked.ok) return badRequest(checked.error)
  const input = checked.value

  // ── The call it is booked from: this ref, this agent, a call the page shows ─
  let callLogId: string | null = null
  if (input.callRef) {
    const { data: call, error } = await supabase
      .from('call_logs')
      .select('id')
      .eq('public_ref', input.callRef)
      .eq('agent_id', agent.id)
      .eq('status', 'completed')
      .maybeSingle()
    if (error || !call) return notFound('Samtalet')
    callLogId = call.id
  }

  const { count, error: countError } = await supabase
    .from('bos_bookings')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agent.id)
    .is('deleted_at', null)
    .gte('starts_at', new Date().toISOString())
  if (countError && isMissingTable(countError)) return notEnabled()
  if ((count ?? 0) >= MAX_UPCOMING) {
    return reply({ error: `Kalendern har redan ${MAX_UPCOMING} kommande bokningar.` }, 409)
  }

  const { data: row, error } = await supabase
    .from('bos_bookings')
    .insert({
      agent_id: agent.id,
      call_log_id: callLogId,
      title: input.title,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      caller_name: input.callerName,
      note: input.note,
    })
    .select(BOOKING_COLS)
    .single()

  if (error) {
    if (isMissingTable(error)) return notEnabled()
    if (isCheckViolation(error)) return badRequest('Bokningen är ogiltig.')
    console.error('[public-agent/bookings] Kunde inte skapa:', error.message)
    return reply({ error: 'Bokningen kunde inte sparas just nu.' }, 500)
  }

  const callRefById = callLogId && input.callRef ? new Map([[callLogId, input.callRef]]) : new Map<string, string>()
  return reply({ booking: toPublicBooking(row as BookingRow, callRefById) }, 201)
}
