import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.CAL_COM_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'CAL_COM_API_KEY saknas i servermiljön (.env.local).' },
      { status: 500 }
    )
  }

  const { eventTypeId, startTime, endTime } = await req.json()
  if (!eventTypeId) {
    return NextResponse.json({ error: 'eventTypeId krävs — sätt Cal.com Event Type ID i Kalender-fliken.' }, { status: 400 })
  }

  const start = startTime || new Date().toISOString()
  const end = endTime || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const params = new URLSearchParams({
    apiKey,
    eventTypeId: String(eventTypeId),
    startTime: start,
    endTime: end,
  })

  const res = await fetch(`https://api.cal.com/v1/slots?${params}`)
  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json({ error: data.message || `Cal.com-fel (${res.status})` }, { status: res.status })
  }

  return NextResponse.json({ slots: data.slots ?? data })
}
