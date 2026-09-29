import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { countProcessingCalls, syncAgentCalls } from '@/lib/call-sync'
import { toPublicCall, type CallRow, type PublicCallsResponse } from '@/lib/public-calls'

// Backs the "Era samtal" section of the public Master Demo / BOS page
// (app/master/[shareId]): the client's own view of the calls their AI
// receptionist has taken, with no login.
//
// SECURITY. The share id is all a visitor holds, and it resolves to exactly one
// agent here on the server. Every call_logs query is filtered on that agent's
// id, and the id itself never leaves this file. The response is built by
// toPublicCall(), which copies an allow-list of display fields: no call, agent
// or lead ids, no error_message (it holds ElevenLabs conversation ids and
// upstream error bodies), no cost, no to_number. call_logs is closed to the anon
// role (019_auth_rls.sql), so the browser cannot go around this route to
// PostgREST either.
//
// PRIVACY. Anyone with the link can open the page, and links get forwarded. The
// callers are private individuals, so their numbers are masked, and phone
// numbers, e-mail addresses and personnummer are redacted from transcripts and
// summaries (lib/redact.ts). The logged-in dashboard still shows everything.
//
// The operator can switch the section off per link in the Master Demo builder
// (master_sections.calls = false). This route then returns nothing at all
// rather than relying on the page to hide what it was sent.

// The caller asked to be contacted, yet the business only sees a masked number
// here. Switch this on to show the full number — on contact requests only — so
// the business can ring back straight from the page. It is off because the link
// is not a login: whoever holds it would see those numbers too.
const SHOW_FULL_NUMBER_ON_CONTACT_REQUESTS = false

const MAX_CALLS = 50

// How long a page load waits for newly finished calls to be fetched from
// ElevenLabs and summarised. Whatever is still running after that carries on
// after the response (next/server `after`) and shows up on the next load.
const SYNC_BUDGET_MS = 8_000

const NO_STORE = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  const supabase = createSupabaseServiceClient()

  // master_sections arrives with migration 017; same fallback as the master route.
  let { data: agent, error } = await supabase
    .from('agents')
    .select('id, name, business_name, master_sections')
    .eq('public_share_id', shareId)
    .maybeSingle()

  if (error && error.message.includes('master_sections')) {
    ({ data: agent, error } = await supabase
      .from('agents')
      .select('id, name, business_name')
      .eq('public_share_id', shareId)
      .maybeSingle())
  }

  if (error || !agent) {
    return NextResponse.json({ error: 'Demon hittades inte' }, { status: 404, headers: NO_STORE })
  }

  const empty: PublicCallsResponse = { calls: [], processing: 0 }

  const sections = (agent as { master_sections?: Record<string, boolean> | null }).master_sections ?? null
  if (sections?.calls === false) {
    return NextResponse.json(empty, { headers: NO_STORE })
  }

  // Bring this agent's newest calls up to date before reading them.
  const sync = syncAgentCalls(supabase, {
    id: agent.id,
    businessName: agent.business_name || agent.name,
  }).catch(err => console.error('[public-agent/calls] Synk misslyckades:', err))

  let budgetTimer: ReturnType<typeof setTimeout> | undefined
  const finishedInTime = await Promise.race([
    sync.then(() => true),
    new Promise<false>(resolve => { budgetTimer = setTimeout(() => resolve(false), SYNC_BUDGET_MS) }),
  ])
  clearTimeout(budgetTimer)
  if (!finishedInTime) after(sync)

  // contact_request / contact_note arrive with migration 027. Without them the
  // list still works — it just has no "Vill bli kontaktad" badges yet.
  const BASE_COLS = 'created_at, duration_sec, summary, transcript, from_number'

  // Typed as CallRow, where the 027 columns are optional, so both selects fit.
  let rows: CallRow[] | null
  let callsError: { message: string } | null

  ;({ data: rows, error: callsError } = await supabase
    .from('call_logs')
    .select(`${BASE_COLS}, contact_request, contact_note`)
    .eq('agent_id', agent.id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(MAX_CALLS))

  if (callsError && callsError.message.includes('contact_')) {
    ({ data: rows, error: callsError } = await supabase
      .from('call_logs')
      .select(BASE_COLS)
      .eq('agent_id', agent.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(MAX_CALLS))
  }

  if (callsError) {
    console.error('[public-agent/calls] Kunde inte läsa samtal:', callsError.message)
    return NextResponse.json({ error: 'Samtalen kunde inte hämtas just nu.' }, { status: 500, headers: NO_STORE })
  }

  const body: PublicCallsResponse = {
    calls: (rows ?? []).map(row =>
      toPublicCall(row, { showFullNumberOnRequest: SHOW_FULL_NUMBER_ON_CONTACT_REQUESTS }),
    ),
    processing: await countProcessingCalls(supabase, agent.id),
  }

  return NextResponse.json(body, { headers: NO_STORE })
}
