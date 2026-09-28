import { NextResponse } from 'next/server'

// Numbers already in the Twilio account, for attaching one to an agent without
// buying anything.
//
// The purchase flow only ever surfaced numbers available to BUY, so a number
// bought earlier — or ported in, or on another country's inventory — was
// invisible to the app and could not be wired to an agent at all.
//
// Protected by middleware.ts: the /api/twilio/search-numbers,
// /api/twilio/purchase-number and /api/twilio/release-number prefixes are each
// listed there, and this route is added alongside them.

function twilioAuth() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return null
  return { sid, header: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') }
}

export async function GET() {
  const auth = twilioAuth()
  if (!auth) {
    return NextResponse.json(
      { error: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN saknas i servermiljön.' },
      { status: 500 }
    )
  }

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${auth.sid}/IncomingPhoneNumbers.json?PageSize=100`,
    { headers: { Authorization: auth.header } }
  )
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    return NextResponse.json(
      { error: data.message || `Kunde inte hämta dina Twilio-nummer (${res.status}).` },
      { status: res.status }
    )
  }

  const numbers = (data.incoming_phone_numbers || []).map(
    (n: {
      sid: string
      phone_number: string
      friendly_name: string
      voice_url?: string
      capabilities?: { voice?: boolean; sms?: boolean }
    }) => ({
      sid: n.sid,
      phoneNumber: n.phone_number,
      friendlyName: n.friendly_name,
      voiceUrl: n.voice_url || null,
      // Surfaced so the UI can warn about an SMS-only number, which would be
      // registered happily and then never receive a call.
      voiceCapable: Boolean(n.capabilities?.voice),
    })
  )

  return NextResponse.json({ numbers })
}
