import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { availableSlots, pickTwoSlots } from '@/lib/cal-com'
import { notFound, reply, ROUTE_BUDGET_MS, salesCallFor, toolAuthorised, toolBody } from '@/lib/sales-tools'

// Verktyget lediga_tider på säljlinjen: två tider för ett möte med Samuel,
// ur Cal.com (lib/cal-com.ts). Tiderna sparas på sales_calls-raden så att
// boka_mote bara kan boka en av dem — modellen kan inte hitta på en tid.

export const dynamic = 'force-dynamic'

const DAYS_AHEAD = 10
const NONE = 'Inga lediga tider de närmaste tio dagarna. Säg att Samuel hör av sig i stället.'
const UNAVAILABLE = 'Kalendern gick inte att nå just nu. Säg att Samuel hör av sig i stället.'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!toolAuthorised(req, token)) {
    console.warn('[sales/lediga-tider] Avvisad: token eller hemlig header stämmer inte')
    return notFound()
  }

  const body = await toolBody(req)
  if (!body.conversationId) return reply(UNAVAILABLE)

  const work = async () => {
    const supabase = createSupabaseServiceClient()
    const found = await salesCallFor(supabase, body.conversationId!, body.calledNumber)
    if (!found) return UNAVAILABLE
    if (!found.agent.cal_com_event_type_id) {
      console.error('[sales/lediga-tider] agents.cal_com_event_type_id saknas')
      return UNAVAILABLE
    }
    const now = new Date()
    const slots = await availableSlots(found.agent.cal_com_event_type_id, now, new Date(now.getTime() + DAYS_AHEAD * 86_400_000))
    if (slots === null) return UNAVAILABLE
    const offered = pickTwoSlots(slots, now)
    if (offered.length === 0) return NONE

    const { error } = await supabase.from('sales_calls')
      .update({ offered_slots: offered, updated_at: now.toISOString() }).eq('id', found.row.id)
    if (error) {
      console.error(`[sales/lediga-tider] Kunde inte spara tiderna: ${error.message}`)
      return UNAVAILABLE
    }
    console.log(`[sales/lediga-tider] ${body.conversationId}: ${offered.length} tider erbjudna`)
    return offered.map(s => `${s.n}: ${s.spoken}.`).join(' ')
  }

  const result = await Promise.race([
    work().catch(err => { console.error('[sales/lediga-tider] Kastade:', err); return UNAVAILABLE }),
    new Promise<string>(r => setTimeout(() => r(UNAVAILABLE), ROUTE_BUDGET_MS)),
  ])
  return reply(result)
}
