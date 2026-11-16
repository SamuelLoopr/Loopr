import { NextRequest } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { createBooking, spokenSlot } from '@/lib/cal-com'
import { parseEmailAddress } from '@/lib/email'
import { notFound, reply, ROUTE_BUDGET_MS, salesCallFor, toolAuthorised, toolBody } from '@/lib/sales-tools'

// Verktyget boka_mote på säljlinjen: bokar tid 1 eller 2 från lediga_tider i
// Cal.com. Modellen skickar `val` (1 eller 2), namn, e-post och företag —
// aldrig en tid. E-posten valideras här; en adress modellen hört fel på
// avvisas och agenten ber personen säga den igen.

export const dynamic = 'force-dynamic'

const FAILED = 'Bokningen gick inte att göra just nu. Säg att Samuel hör av sig och bekräftar en tid.'
const NO_SLOTS = 'Inga tider har hämtats än. Anropa lediga_tider först.'
const BAD_CHOICE = 'Välj tid 1 eller 2 från lediga_tider.'
const BAD_EMAIL = 'E-postadressen gick inte att tolka. Be personen säga den igen, och upprepa den tecken för tecken.'
const TAKEN = 'Tiden är inte längre ledig. Erbjud den andra tiden, eller säg att Samuel hör av sig.'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!toolAuthorised(req, token)) {
    console.warn('[sales/boka-mote] Avvisad: token eller hemlig header stämmer inte')
    return notFound()
  }

  const body = await toolBody(req)
  if (!body.conversationId) return reply(FAILED)

  const work = async () => {
    const supabase = createSupabaseServiceClient()
    const found = await salesCallFor(supabase, body.conversationId!, body.calledNumber)
    if (!found) return FAILED
    const { row, agent } = found
    if (!agent.cal_com_event_type_id) return FAILED
    if (row.booking_uid) return 'Mötet är redan bokat.'

    const choice = Number(body.fields.val)
    const slot = (row.offered_slots ?? []).find(s => s.n === choice)
    if (!row.offered_slots || row.offered_slots.length === 0) return NO_SLOTS
    if (!slot) return BAD_CHOICE

    const email = parseEmailAddress(body.fields.epost)
    if (!email.ok || !email.value) return BAD_EMAIL
    const name = typeof body.fields.namn === 'string' ? body.fields.namn.trim().slice(0, 80) : ''
    const company = typeof body.fields.foretag === 'string' ? body.fields.foretag.trim().slice(0, 120) : ''
    if (!name) return 'Namnet saknas. Fråga vad personen heter.'

    const booked = await createBooking({
      eventTypeId: agent.cal_com_event_type_id,
      start: slot.start,
      name,
      email: email.value,
      notes: company ? `${company} · via Loopr Voice` : 'via Loopr Voice',
      metadata: { source: 'loopr_voice', conversation_id: body.conversationId! },
    })
    if (!booked.ok) return booked.reason === 'taken' ? TAKEN : FAILED

    const { error } = await supabase.from('sales_calls').update({
      booking_uid: booked.uid, meeting_at: booked.start, email: email.value,
      caller_name: name, company: company || null, updated_at: new Date().toISOString(),
    }).eq('id', row.id)
    if (error) console.error(`[sales/boka-mote] Bokat hos Cal.com men kunde inte spara: ${error.message}`)
    console.log(`[sales/boka-mote] ${body.conversationId}: bokat ${slot.start}`)
    return `Bokat: ${spokenSlot(booked.start)}. Bekräftelse skickas till e-posten.`
  }

  const result = await Promise.race([
    work().catch(err => { console.error('[sales/boka-mote] Kastade:', err); return FAILED }),
    new Promise<string>(r => setTimeout(() => r(FAILED), ROUTE_BUDGET_MS)),
  ])
  return reply(result)
}
