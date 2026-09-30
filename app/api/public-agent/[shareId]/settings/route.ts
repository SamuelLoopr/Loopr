import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { isMissingColumn } from '@/lib/db-errors'
import { parseEmailAddress } from '@/lib/email'
import { resolveShareAgent } from '@/lib/share-agent'

// Inställningarna klienten själv ändrar under "Ert konto" på sin BOS-sida
// (/master/[shareId]) — just nu bara adressen som samtalsnotiserna går till.
//
// SÄKERHET, samma mönster som samtalsstatus och bokningar:
//  - Share-id:t löses till exakt en agent på servern, och bara när sidan är i
//    klientläge. En säljdemolänk har ingen "Ert konto"-sektion och får 404 här.
//  - Alla skrivningar filtreras på den agentens id, som aldrig lämnar servern.
//  - Kroppen är en allow-list: bara notificationEmail tas emot, allt annat
//    avvisas i stället för att ignoreras, så ingen annan kolumn går att nå.
//  - agents är stängd för anon-rollen (019_auth_rls.sql); routen kör på
//    service-rollen och sköter all avgränsning själv.

const MAX_BODY_BYTES = 4096

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: HEADERS })
const notFound = () => reply({ error: 'Sidan hittades inte.' }, 404)

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params

  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return reply({ error: 'Förfrågan är för stor.' }, 413)
  }

  const supabase = createSupabaseServiceClient()
  const agent = await resolveShareAgent(supabase, shareId)
  if (!agent?.clientMode) return notFound()

  // ── Kroppen ─────────────────────────────────────────────────────────────
  const body: unknown = await req.json().catch(() => undefined)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply({ error: 'Ogiltig förfrågan.' }, 400)

  const keys = Object.keys(body)
  const unknown = keys.filter(k => k !== 'notificationEmail')
  if (unknown.length > 0) return reply({ error: `Okänt fält: ${unknown.join(', ')}.` }, 400)
  if (keys.length === 0) return reply({ error: 'Inget att ändra.' }, 400)

  const parsed = parseEmailAddress((body as { notificationEmail?: unknown }).notificationEmail)
  if (!parsed.ok) return reply({ error: parsed.error }, 400)

  // ── Spara ───────────────────────────────────────────────────────────────
  const { data, error } = await supabase
    .from('agents')
    .update({ notification_email: parsed.value })
    .eq('id', agent.id)
    .select('notification_email')
    .maybeSingle()

  if (error) {
    if (isMissingColumn(error)) {
      return reply({ error: 'Notiser är inte aktiverade för den här sidan ännu.' }, 503)
    }
    // 23514 = CHECK-villkoret i migration 030. parseEmailAddress har redan
    // sagt nej till allt det fångar, så hit kommer bara oväntade fall.
    if (error.code === '23514') return reply({ error: 'Det där ser inte ut som en e-postadress.' }, 400)
    console.error('[public-agent/settings] Kunde inte spara:', error.message)
    return reply({ error: 'Kunde inte spara just nu. Försök igen om en stund.' }, 500)
  }
  if (!data) return notFound()

  // ── Inga notiser för det som redan hänt ─────────────────────────────────
  // Utan det här skulle den som just skrivit in sin adress få ett mejl per
  // gammalt samtal nästa gång sidan laddas — analysen stämplar ju bara de rader
  // den själv rör. Allt oskickat stämplas som redan notiserat, så notiserna
  // börjar gälla framåt. Sker vid varje sparad adress, alltså även när klienten
  // slagit av notiserna en period och slår på dem igen.
  if (parsed.value) {
    const { error: stampError } = await supabase
      .from('call_logs')
      .update({ notified_at: new Date().toISOString() })
      .eq('agent_id', agent.id)
      .is('notified_at', null)
    if (stampError && !isMissingColumn(stampError)) {
      console.error('[public-agent/settings] Kunde inte stämpla gamla samtal:', stampError.message)
    }
  }

  return reply({ notificationEmail: data.notification_email ?? null })
}
