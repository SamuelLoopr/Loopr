import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { countProcessingCalls, syncAgentCalls } from '@/lib/call-sync'
import { isMissingColumn, isMissingTable } from '@/lib/db-errors'
import { resolveShareAgent, sectionOn } from '@/lib/share-agent'
import { toPublicCall, type CallRow, type PublicCallsResponse } from '@/lib/public-calls'
import { BOOKING_COLS, toPublicBooking, type BookingRow, type PublicBooking } from '@/lib/public-bookings'

// Backs the calls section of the public BOS page (app/master/[shareId]): the
// client's own view of the calls their AI receptionist has taken, with no
// login. Status and notes are written back through ./[ref]/route.ts, bookings
// through ../bookings.
//
// SECURITY. The share id is all a visitor holds, and it resolves to exactly one
// agent here on the server (lib/share-agent.ts). Every call_logs and
// bos_bookings query is filtered on that agent's id, and the id itself never
// leaves this file. The response is built by toPublicCall() and
// toPublicBooking(), which copy an allow-list of display fields: no call, agent,
// lead, user or booking ids, no error_message (it holds ElevenLabs conversation
// ids and upstream error bodies), no cost, no to_number. The handles per call
// and per booking are their random public_refs, which open nothing on their own.
// call_logs and bos_bookings are closed to the anon role, so the browser cannot
// go around these routes to PostgREST either.
//
// PRIVACY. Anyone with the link can open the page, and links get forwarded.
// Phone numbers, e-mail addresses and personnummer are redacted from
// transcripts and summaries (lib/redact.ts) in both modes.
//
// The caller's own number is treated differently in the two modes. On a CLIENT
// page it is shown in full, because that page is the business's own workspace
// and the number is there to be rung back. On a SALES DEMO it is masked: that
// link is made to be shown to a prospect who is not the business, and can be
// forwarded to anyone.
//
// The operator can switch the section off per link in the Master Demo / Bygg BOS
// builders (master_sections.calls = false). This route then returns nothing at
// all rather than relying on the page to hide what it was sent — and the write
// route refuses too.

const MAX_CALLS = 50

// How long a page load waits for newly finished calls to be fetched from
// ElevenLabs and summarised. Whatever is still running after that carries on
// after the response (next/server `after`) and shows up on the next load.
const SYNC_BUDGET_MS = 8_000

const NO_STORE = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
}

// `id` is read for pairing calls with their bookings here on the server;
// toPublicCall() never copies it.
const BASE_COLS = 'id, created_at, duration_sec, summary, transcript, from_number'

// Newest schema first; each step down is what an older database can serve. The
// code ships ahead of its migrations, so the list must keep working on all three.
const COLUMN_SETS: { cols: string; editable: boolean }[] = [
  // 028_bos_client_crm: name, status, note and the per-call ref for writes.
  {
    cols: `${BASE_COLS}, contact_request, contact_note, public_ref, caller_name, client_status, client_note`,
    editable: true,
  },
  // 027_call_insights: "Vill bli kontaktad" badges, read-only.
  { cols: `${BASE_COLS}, contact_request, contact_note`, editable: false },
  { cols: BASE_COLS, editable: false },
]

type CallRowWithId = CallRow & { id: string }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  const supabase = createSupabaseServiceClient()

  const agent = await resolveShareAgent(supabase, shareId)
  if (!agent) {
    return NextResponse.json({ error: 'Länken hittades inte' }, { status: 404, headers: NO_STORE })
  }

  const empty: PublicCallsResponse = { calls: [], processing: 0, editable: false, bookingsEnabled: false }
  if (!sectionOn(agent, 'calls')) {
    return NextResponse.json(empty, { headers: NO_STORE })
  }

  // Bring this agent's newest calls up to date before reading them.
  // Notisadressen och share-id:t följer med så att en rad som blir
  // färdiganalyserad här kan mejlas vidare till klienten (lib/call-notify.ts).
  const sync = syncAgentCalls(supabase, {
    id: agent.id,
    shareId,
    businessName: agent.businessName || agent.name,
    notificationEmail: agent.clientMode ? agent.notificationEmail : null,
  }).catch(err => console.error('[public-agent/calls] Synk misslyckades:', err))

  let budgetTimer: ReturnType<typeof setTimeout> | undefined
  const finishedInTime = await Promise.race([
    sync.then(() => true),
    new Promise<false>(resolve => { budgetTimer = setTimeout(() => resolve(false), SYNC_BUDGET_MS) }),
  ])
  clearTimeout(budgetTimer)
  if (!finishedInTime) after(sync)

  let rows: CallRowWithId[] = []
  let editable = false
  let callsError: { code?: string; message: string } | null = null

  for (const set of COLUMN_SETS) {
    const res = await supabase
      .from('call_logs')
      .select(set.cols)
      .eq('agent_id', agent.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(MAX_CALLS)

    callsError = res.error
    if (!res.error) {
      rows = (res.data ?? []) as unknown as CallRowWithId[]
      editable = set.editable
      break
    }
    // Only a column this schema lacks is a reason to step down; anything else
    // is a real failure.
    if (!isMissingColumn(res.error)) break
  }

  if (callsError) {
    console.error('[public-agent/calls] Kunde inte läsa samtal:', callsError.message)
    return NextResponse.json({ error: 'Samtalen kunde inte hämtas just nu.' }, { status: 500, headers: NO_STORE })
  }

  // ── Bookings made from these calls — client mode only (029) ─────────────
  let bookingsEnabled = false
  const bookingsByCall = new Map<string, PublicBooking[]>()

  if (agent.clientMode && editable) {
    const callRefById = new Map(rows.filter(r => r.public_ref).map(r => [r.id, r.public_ref as string]))
    const { data: bookingRows, error: bookingsError } = rows.length
      ? await supabase
          .from('bos_bookings')
          .select(BOOKING_COLS)
          .eq('agent_id', agent.id)
          .is('deleted_at', null)
          .in('call_log_id', rows.map(r => r.id))
          .order('starts_at', { ascending: true })
      : { data: [], error: null }

    if (!bookingsError) {
      bookingsEnabled = true
      for (const b of (bookingRows ?? []) as BookingRow[]) {
        if (!b.call_log_id) continue
        const list = bookingsByCall.get(b.call_log_id) ?? []
        list.push(toPublicBooking(b, callRefById))
        bookingsByCall.set(b.call_log_id, list)
      }
    } else if (!isMissingTable(bookingsError)) {
      console.error('[public-agent/calls] Kunde inte läsa bokningar:', bookingsError.message)
    }
  }

  const body: PublicCallsResponse = {
    calls: rows.map(row =>
      toPublicCall(row, {
        revealNumber: agent.clientMode,
        bookings: bookingsByCall.get(row.id),
      }),
    ),
    processing: await countProcessingCalls(supabase, agent.id),
    editable,
    bookingsEnabled,
  }

  return NextResponse.json(body, { headers: NO_STORE })
}
