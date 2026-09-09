import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.CAL_COM_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'CAL_COM_API_KEY saknas i servermiljön (.env.local).' },
      { status: 500 }
    )
  }

  const { eventTypeId, start, name, email, timeZone, notes } = await req.json()
  if (!eventTypeId || !start || !name || !email) {
    return NextResponse.json({ error: 'eventTypeId, start, name och email krävs' }, { status: 400 })
  }

  const res = await fetch(`https://api.cal.com/v1/bookings?apiKey=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventTypeId: Number(eventTypeId),
      start,
      responses: { name, email, notes: notes || '' },
      timeZone: timeZone || 'Europe/Stockholm',
      language: 'sv',
      metadata: {},
    }),
  })
  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json({ error: data.message || `Cal.com-fel (${res.status})` }, { status: res.status })
  }

  return NextResponse.json({ booking: data })
}
