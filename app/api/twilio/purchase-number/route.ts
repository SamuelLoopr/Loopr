import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function twilioAuthHeader() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return null
  return { sid, header: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') }
}

export async function POST(req: NextRequest) {
  const auth = twilioAuthHeader()
  if (!auth) {
    return NextResponse.json(
      { error: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN saknas i servermiljön (.env.local).' },
      { status: 500 }
    )
  }

  const { agentId, phoneNumber } = await req.json()
  if (!agentId || !phoneNumber) {
    return NextResponse.json({ error: 'agentId och phoneNumber krävs' }, { status: 400 })
  }

  const appBaseUrl = process.env.APP_BASE_URL
  if (!appBaseUrl) {
    return NextResponse.json(
      { error: 'APP_BASE_URL saknas i servermiljön — behövs så Twilio vet vart samtal ska skickas.' },
      { status: 500 }
    )
  }
  const voiceUrl = `${appBaseUrl.replace(/\/$/, '')}/api/twilio/incoming-call`

  const params = new URLSearchParams({
    PhoneNumber: phoneNumber,
    VoiceUrl: voiceUrl,
    VoiceMethod: 'POST',
  })

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${auth.sid}/IncomingPhoneNumbers.json`,
    { method: 'POST', headers: { Authorization: auth.header, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params }
  )
  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json({ error: data.message || `Twilio-fel (${res.status})` }, { status: res.status })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: row, error: dbErr } = await supabase
    .from('phone_numbers')
    .insert({
      agent_id: agentId,
      phone_number: data.phone_number,
      twilio_sid: data.sid,
      friendly_name: data.friendly_name,
    })
    .select()
    .single()

  if (dbErr) {
    return NextResponse.json({ error: `Numret köptes men kunde inte sparas: ${dbErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ phoneNumber: row })
}
