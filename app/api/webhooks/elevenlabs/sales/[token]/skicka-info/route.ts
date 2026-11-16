import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { parseEmailAddress } from '@/lib/email'
import { sendInfoEmail } from '@/lib/sales-info-email'
import { firstNameOf, notFound, reply, ROUTE_BUDGET_MS, salesCallFor, toolAuthorised, toolBody } from '@/lib/sales-tools'

// Verktyget skicka_info på säljlinjen: prislistan och videon till personens
// e-post (lib/sales-info-email.ts). Skickas direkt — anropet är personens ja
// — och högst en gång per samtal.

export const dynamic = 'force-dynamic'

const FAILED = 'Mejlet gick inte att skicka just nu. Säg att Samuel mejlar det i stället.'
const BAD_EMAIL = 'E-postadressen gick inte att tolka. Be personen säga den igen, och upprepa den tecken för tecken.'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!toolAuthorised(req, token)) {
    console.warn('[sales/skicka-info] Avvisad: token eller hemlig header stämmer inte')
    return notFound()
  }

  const body = await toolBody(req)
  if (!body.conversationId) return reply(FAILED)

  const work = async () => {
    const supabase = createSupabaseServiceClient()
    const found = await salesCallFor(supabase, body.conversationId!, body.calledNumber)
    if (!found) return FAILED
    const { row } = found
    if (row.info_sent_at) return 'Redan skickat.'

    const email = parseEmailAddress(body.fields.epost)
    if (!email.ok || !email.value) return BAD_EMAIL
    const name = typeof body.fields.namn === 'string' ? body.fields.namn.trim().slice(0, 80) : ''
    const company = typeof body.fields.foretag === 'string' ? body.fields.foretag.trim().slice(0, 120) : ''

    // Adressen sparas före utskicket: hamnar den i leadet är den värd något
    // även om mejlet inte går ut.
    await supabase.from('sales_calls').update({
      email: email.value, caller_name: row.caller_name ?? (name || null), company: row.company ?? (company || null),
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)

    const result = await sendInfoEmail(email.value, { firstName: firstNameOf(name || row.caller_name), company: company || row.company })
    if (result.status !== 'sent') {
      const reason = result.status === 'failed' ? result.error : result.reason
      console.error(`[sales/skicka-info] ${body.conversationId}: ${reason}`)
      return FAILED
    }
    await supabase.from('sales_calls').update({ info_sent_at: new Date().toISOString() }).eq('id', row.id)
    console.log(`[sales/skicka-info] ${body.conversationId}: skickat (${result.id})`)
    return 'Skickat.'
  }

  const result = await Promise.race([
    work().catch(err => { console.error('[sales/skicka-info] Kastade:', err); return FAILED }),
    new Promise<string>(r => setTimeout(() => r(FAILED), ROUTE_BUDGET_MS)),
  ])
  return reply(result)
}
