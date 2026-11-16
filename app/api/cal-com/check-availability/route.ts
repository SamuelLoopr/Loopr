import { NextRequest, NextResponse } from 'next/server'
import { availableSlots } from '@/lib/cal-com'

// Kalender-flikens "testa anslutningen" i dashboarden. Kräver inloggning
// (middleware.ts). Cal.com API v2 via lib/cal-com.ts — v1 är nedlagt.

export async function POST(req: NextRequest) {
  if (!process.env.CAL_COM_API_KEY) {
    return NextResponse.json({ error: 'CAL_COM_API_KEY saknas i servermiljön (.env.local).' }, { status: 500 })
  }

  const { eventTypeId, startTime, endTime } = await req.json()
  if (!eventTypeId) {
    return NextResponse.json({ error: 'eventTypeId krävs — sätt Cal.com Event Type ID i Kalender-fliken.' }, { status: 400 })
  }

  const start = startTime ? new Date(startTime) : new Date()
  const end = endTime ? new Date(endTime) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return NextResponse.json({ error: 'startTime och endTime måste vara giltiga tidpunkter.' }, { status: 400 })
  }

  const slots = await availableSlots(String(eventTypeId), start, end)
  if (slots === null) {
    return NextResponse.json({ error: 'Cal.com svarade inte — kontrollera nyckeln och eventtypen.' }, { status: 502 })
  }
  return NextResponse.json({ slots: slots.map(start => ({ start })) })
}
