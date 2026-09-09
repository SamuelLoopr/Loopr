import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Twilio posts application/x-www-form-urlencoded to this URL when someone
// dials a number purchased on the Phone tab. We look up which agent owns
// that number, fetch its ElevenLabs signed URL (same mechanism the browser
// Test tab uses), and hand the call off via TwiML <Connect><Stream>.
//
// NOTE: the exact WSS handshake ElevenLabs expects for a Twilio Media Stream
// vs. the browser SDK may differ slightly — this reuses the same
// get_signed_url flow as app/api/create-conversation/route.ts (the flow
// that's confirmed working from the browser). Verify against ElevenLabs'
// current Twilio integration docs before relying on this in production;
// if the stream format doesn't match, Twilio will hang up immediately and
// this route's error response below is what you'll see in Twilio's call logs.

function twiml(xml: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

function sayError(message: string) {
  return twiml(`<Response><Say language="sv-SE">${message}</Say><Hangup/></Response>`)
}

export async function POST(req: NextRequest) {
  const elApiKey = process.env.ELEVENLABS_API_KEY
  const elAgentId = process.env.ELEVENLABS_AGENT_ID
  if (!elApiKey || !elAgentId) {
    return sayError('Systemet är inte konfigurerat. E L E V E N L A B S nycklar saknas.')
  }

  const form = await req.formData()
  const to = (form.get('To') as string | null)?.trim()
  const from = (form.get('From') as string | null)?.trim()
  const callSid = form.get('CallSid') as string | null

  if (!to) return sayError('Kunde inte identifiera numret som ringdes.')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Twilio numbers are stored in E.164 (+46...); match loosely on digits
  // in case formatting differs between what Twilio sends and what we stored.
  const digits = to.replace(/[^\d]/g, '')
  const { data: numbers } = await supabase
    .from('phone_numbers')
    .select('agent_id, phone_number')
    .limit(50)
  const match = numbers?.find(n => n.phone_number.replace(/[^\d]/g, '').endsWith(digits.slice(-9)))

  if (!match) {
    return sayError('Det här numret är inte kopplat till någon agent längre.')
  }

  const { data: agent, error: agentErr } = await supabase
    .from('agents')
    .select('prompt_text, welcome_message, language, voice_id')
    .eq('id', match.agent_id)
    .single()

  if (agentErr || !agent) {
    return sayError('Agenten kunde inte hittas.')
  }

  const elRes = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(elAgentId)}`,
    { headers: { 'xi-api-key': elApiKey } }
  )

  if (!elRes.ok) {
    await supabase.from('call_logs').insert({
      agent_id: match.agent_id,
      from_number: from,
      to_number: to,
      status: 'error',
      error_message: `ElevenLabs get_signed_url misslyckades (${elRes.status}) för samtal ${callSid}`,
    })
    return sayError('Kunde inte ansluta till AI-agenten just nu.')
  }

  const { signed_url } = await elRes.json()

  await supabase.from('call_logs').insert({
    agent_id: match.agent_id,
    from_number: from,
    to_number: to,
    status: 'in_progress',
  })

  return twiml(`<Response><Connect><Stream url="${signed_url}" /></Connect></Response>`)
}
