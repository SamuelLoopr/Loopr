import { NextRequest, NextResponse } from 'next/server'

function twilioAuthHeader() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) return null
  return { sid, header: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64') }
}

export async function GET(req: NextRequest) {
  const auth = twilioAuthHeader()
  if (!auth) {
    return NextResponse.json(
      { error: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN saknas i servermiljön (.env.local).' },
      { status: 500 }
    )
  }

  const { searchParams } = new URL(req.url)
  const country = (searchParams.get('country') || 'SE').toUpperCase()
  const areaCode = searchParams.get('areaCode')?.trim() || ''

  const params = new URLSearchParams({ Limit: '10' })
  // Twilio's US/CA numbers support a true AreaCode filter; most other
  // countries (incl. Sweden) only support pattern-matching via Contains.
  if (areaCode) {
    if (country === 'US' || country === 'CA') params.set('AreaCode', areaCode)
    else params.set('Contains', areaCode)
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${auth.sid}/AvailablePhoneNumbers/${country}/Local.json?${params}`
  const res = await fetch(url, { headers: { Authorization: auth.header } })
  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json({ error: data.message || `Twilio-fel (${res.status})` }, { status: res.status })
  }

  const numbers = (data.available_phone_numbers || []).map((n: { phone_number: string; friendly_name: string; locality?: string }) => ({
    phoneNumber: n.phone_number,
    friendlyName: n.friendly_name,
    locality: n.locality ?? null,
  }))

  return NextResponse.json({ numbers })
}
