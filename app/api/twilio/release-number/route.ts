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

  const { phoneNumberId, twilioSid } = await req.json()
  if (!phoneNumberId || !twilioSid) {
    return NextResponse.json({ error: 'phoneNumberId och twilioSid krävs' }, { status: 400 })
  }

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${auth.sid}/IncomingPhoneNumbers/${twilioSid}.json`,
    { method: 'DELETE', headers: { Authorization: auth.header } }
  )

  // Twilio returns 204 No Content on success
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}))
    return NextResponse.json({ error: data.message || `Twilio-fel (${res.status})` }, { status: res.status })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { error: dbErr } = await supabase.from('phone_numbers').delete().eq('id', phoneNumberId)
  if (dbErr) {
    return NextResponse.json({ error: `Numret släpptes hos Twilio men kunde inte tas bort lokalt: ${dbErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
