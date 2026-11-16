import { NextRequest, NextResponse } from 'next/server'
import { createBooking } from '@/lib/cal-com'
import { parseEmailAddress } from '@/lib/email'

// Bokning från dashboarden. Kräver inloggning (middleware.ts). Cal.com API v2
// via lib/cal-com.ts — v1 är nedlagt.

export async function POST(req: NextRequest) {
  if (!process.env.CAL_COM_API_KEY) {
    return NextResponse.json({ error: 'CAL_COM_API_KEY saknas i servermiljön (.env.local).' }, { status: 500 })
  }

  const { eventTypeId, start, name, email, notes } = await req.json()
  if (!eventTypeId || !start || !name || !email) {
    return NextResponse.json({ error: 'eventTypeId, start, name och email krävs' }, { status: 400 })
  }
  const parsed = parseEmailAddress(email)
  if (!parsed.ok || !parsed.value) {
    return NextResponse.json({ error: parsed.ok ? 'email krävs' : parsed.error }, { status: 400 })
  }
  if (Number.isNaN(Date.parse(String(start)))) {
    return NextResponse.json({ error: 'start måste vara en giltig tidpunkt.' }, { status: 400 })
  }

  const booked = await createBooking({
    eventTypeId: String(eventTypeId),
    start: new Date(String(start)).toISOString(),
    name: String(name).trim().slice(0, 80),
    email: parsed.value,
    notes: typeof notes === 'string' ? notes.slice(0, 500) : undefined,
  })
  if (!booked.ok) {
    const status = booked.reason === 'taken' ? 409 : booked.reason === 'not_configured' ? 500 : 502
    const error = booked.reason === 'taken' ? 'Tiden är inte längre ledig.' : 'Bokningen gick inte att göra hos Cal.com.'
    return NextResponse.json({ error }, { status })
  }
  return NextResponse.json({ booking: { uid: booked.uid, start: booked.start } })
}
