import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'

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
    // Twilio's regulatory errors arrive as English prose with a code. The two
    // below are what actually stops a Swedish buyer: most European voice
    // numbers need a verified address and a Regulatory Bundle before purchase.
    const code = String(data.code ?? '')
    const raw = String(data.message ?? '')
    let message = raw || `Twilio-fel (${res.status})`

    if (code === '21649' || /regulatory|bundle/i.test(raw)) {
      message =
        'Numret kräver en godkänd Regulatory Bundle hos Twilio. Skapa den under Phone Numbers → Regulatory Compliance i Twilio-konsolen, vänta på godkännande, och försök sedan igen.'
    } else if (code === '21631' || /address/i.test(raw)) {
      message =
        'Numret kräver en verifierad adress hos Twilio. Lägg till en adress under Phone Numbers → Verified Addresses i Twilio-konsolen och försök igen.'
    } else if (code === '21422' || res.status === 404) {
      message = 'Numret är inte längre tillgängligt. Sök igen och välj ett annat.'
    }

    return NextResponse.json({ error: message }, { status: res.status })
  }

  // Acts as the signed-in user rather than as anon: middleware.ts already
  // guarantees a session on this route, and the authenticated-only RLS policies
  // in 019_auth_rls.sql would reject these reads and writes from the anon role.
  const supabase = await createSupabaseServerClient()
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
