import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { isMissingColumn } from '@/lib/db-errors'
import { CLIENT_NOTE_MAX, clientStatusOf, isClientStatus } from '@/lib/client-status'

// Lets the client work their own calls on the public BOS page (/master/[shareId]):
// set the follow-up status and keep a note. There is no login — the share id is
// the key, exactly as for reading — so this route is where "only your own
// calls" is enforced.
//
// SECURITY
//  - The share id resolves to exactly one agent, here on the server. Its id is
//    used in the query and never sent anywhere.
//  - The call is named by its public_ref: a random value that exists only for
//    this (028_bos_client_crm.sql). The UPDATE is filtered on public_ref AND
//    agent_id AND status = 'completed', in one statement. A ref taken from
//    another client's page, a guessed ref, and the ref of a call the page does
//    not show all match no row and get the same 404 — the response never says
//    whether a ref exists somewhere else.
//  - The body is allow-listed: `status` and/or `note`, validated. Any other key
//    is rejected, so no other column can be reached through this route.
//  - A link whose calls section is switched off accepts no writes either.
//  - call_logs stays closed to the anon role (019_auth_rls.sql); this route
//    runs on the service role and does all of the scoping itself.

const REF_PATTERN = /^[0-9a-f]{32}$/

// A status and a 2000-character note fit in far less; this stops an oversized
// body before it is parsed.
const MAX_BODY_BYTES = 16_384

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }

const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: HEADERS })
const notFound = () => reply({ error: 'Samtalet hittades inte.' }, 404)
const badRequest = (error: string) => reply({ error }, 400)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ shareId: string; ref: string }> },
) {
  const { shareId, ref } = await params
  if (!REF_PATTERN.test(ref)) return notFound()

  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return reply({ error: 'Förfrågan är för stor.' }, 413)
  }

  // ── The body: status and/or note, nothing else ──────────────────────────
  const body: unknown = await req.json().catch(() => undefined)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return badRequest('Ogiltig förfrågan.')

  const keys = Object.keys(body)
  const unknownKeys = keys.filter(k => k !== 'status' && k !== 'note')
  if (unknownKeys.length > 0) return badRequest(`Okänt fält: ${unknownKeys.join(', ')}.`)
  if (keys.length === 0) return badRequest('Inget att ändra.')

  const { status, note } = body as { status?: unknown; note?: unknown }
  const patch: Record<string, string | null> = {}

  if ('status' in body) {
    if (!isClientStatus(status)) return badRequest('Ogiltig status.')
    patch.client_status = status
  }
  if ('note' in body) {
    if (note !== null && typeof note !== 'string') return badRequest('Anteckningen måste vara text.')
    const trimmed = (note ?? '').trim()
    // JS counts UTF-16 units, the database counts characters, so an emoji-heavy
    // note is cut off here slightly earlier than the column's own limit.
    if (trimmed.length > CLIENT_NOTE_MAX) {
      return badRequest(`Anteckningen får vara högst ${CLIENT_NOTE_MAX} tecken.`)
    }
    patch.client_note = trimmed || null
  }
  patch.client_updated_at = new Date().toISOString()

  // ── The link ────────────────────────────────────────────────────────────
  const supabase = createSupabaseServiceClient()

  // master_sections arrives with migration 017; same fallback as the read route.
  let { data: agent, error } = await supabase
    .from('agents')
    .select('id, master_sections')
    .eq('public_share_id', shareId)
    .maybeSingle()

  if (error && error.message.includes('master_sections')) {
    ({ data: agent, error } = await supabase
      .from('agents')
      .select('id')
      .eq('public_share_id', shareId)
      .maybeSingle())
  }

  if (error || !agent) return notFound()

  const sections = (agent as { master_sections?: Record<string, boolean> | null }).master_sections ?? null
  if (sections?.calls === false) return notFound()

  // ── The write: this ref, on this agent, on a call the page shows ────────
  const { data: updated, error: updateError } = await supabase
    .from('call_logs')
    .update(patch)
    .eq('public_ref', ref)
    .eq('agent_id', agent.id)
    .eq('status', 'completed')
    .select('client_status, client_note, client_updated_at')
    .maybeSingle()

  if (updateError) {
    if (isMissingColumn(updateError)) {
      return reply({ error: 'Status och anteckningar är inte aktiverade för den här sidan ännu.' }, 503)
    }
    console.error('[public-agent/calls/ref] Kunde inte spara:', updateError.message)
    return reply({ error: 'Kunde inte spara just nu. Försök igen om en stund.' }, 500)
  }

  if (!updated) return notFound()

  return reply({
    status: clientStatusOf(updated.client_status),
    note: updated.client_note ?? null,
    updatedAt: updated.client_updated_at,
  })
}
