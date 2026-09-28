import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { matchTwilioSignature, webhookUrlCandidates } from '@/lib/twilio-signature'
import { normalizeE164 } from '@/lib/phone'

// Twilio posts application/x-www-form-urlencoded here when someone dials a
// number registered in phone_numbers. We resolve the number to an agent and
// hand the call to ElevenLabs.
//
// ── KNOWN LIMITATION, READ BEFORE TRUSTING THIS IN PRODUCTION ────────────────
// The handoff below uses the browser SDK's get_signed_url inside <Connect>
// <Stream>. That is not one of ElevenLabs' two documented Twilio paths (their
// native integration, where ElevenLabs configures the number itself, or their
// register-call endpoint, which returns the TwiML for you). The browser
// endpoint speaks the SDK's own JSON/PCM protocol; Twilio's Media Streams speak
// a different one. The socket may open and then carry nothing either side
// understands.
//
// The agent overrides are attached as <Parameter> children, which Twilio
// delivers in the stream's `start.customParameters`. Whether ElevenLabs reads
// them on this endpoint is UNVERIFIED — it cannot be established without
// placing a real call. If inbound calls connect but use the wrong voice or
// speak English, that is the first thing to suspect, and the fix is to migrate
// to register-call rather than to patch this further.
//
// Everything else in this file — signature checking, lookup, fallbacks,
// logging — is independent of that and is correct as written.

/** Escapes the five XML entities. The signed URL contains a raw `&`, which
 *  makes the document malformed and Twilio rejects it wholesale. */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function twiml(xml: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

/** Always 200 with valid TwiML: Twilio plays the message and hangs up cleanly.
 *  A 500 here makes the caller hear Twilio's generic application error. */
function sayError(message: string) {
  return twiml(`<Response><Say language="sv-SE">${xmlEscape(message)}</Say><Hangup/></Response>`)
}

export async function POST(req: NextRequest) {
  try {
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const elApiKey = process.env.ELEVENLABS_API_KEY
    const elAgentId = process.env.ELEVENLABS_AGENT_ID

    // Read the body once, as form data — Twilio never sends JSON here.
    const form = await req.formData()
    const params: Record<string, string> = {}
    form.forEach((v, k) => { if (typeof v === 'string') params[k] = v })

    // ── Signature ─────────────────────────────────────────────────────────
    // Fails closed. A missing auth token is a misconfigured deployment, not a
    // reason to accept unsigned requests — otherwise dropping the env var in
    // Vercel would silently turn authentication off.
    if (!authToken) {
      console.error('[twilio/incoming-call] TWILIO_AUTH_TOKEN saknas — avvisar anropet')
      return sayError('Systemet är inte konfigurerat. Var god försök igen senare.')
    }

    // Client created before the signature check so a rejection can still be
    // logged — a silent 403 is exactly what made the www/non-www redirect so
    // hard to diagnose from the outside.
    const supabase = createSupabaseServiceClient()

    const logRejection = async (status: string, reason: string) => {
      const { error } = await supabase.from('call_logs').insert({
        agent_id: null,
        from_number: params.From?.trim() ?? null,
        to_number: params.To?.trim() ?? null,
        status,
        error_message: reason,
      })
      if (error) console.error('[twilio/incoming-call] call_logs-skrivning misslyckades:', error.message)
    }

    const candidates = webhookUrlCandidates(req, '/api/twilio/incoming-call', req.nextUrl.search)
    const signature = req.headers.get('x-twilio-signature')
    const matchedUrl = matchTwilioSignature(authToken, candidates, params, signature)

    if (!matchedUrl) {
      const reason = signature
        ? `Signaturen matchade ingen av: ${candidates.join(', ')}`
        : 'X-Twilio-Signature saknades helt'
      console.error(`[twilio/incoming-call] Avvisat — ${reason}`)
      await logRejection('rejected_signature', reason)
      // Not TwiML: a forged request gets no call flow, just a refusal.
      return new NextResponse('Forbidden', { status: 403 })
    }

    if (!elApiKey || !elAgentId) {
      return sayError('Systemet är inte konfigurerat. Var god försök igen senare.')
    }

    const to = params.To?.trim()
    const from = params.From?.trim() ?? null
    const callSid = params.CallSid ?? null

    if (!to) {
      await logRejection('rejected_no_to', 'Twilio skickade ingen To-parameter')
      return sayError('Kunde inte identifiera numret som ringdes.')
    }

    // Log helper — every inbound call leaves a row, including the ones that
    // never reach an agent. Previously a call to an unregistered number
    // vanished without trace, which made "did it even arrive?" unanswerable.
    const log = async (status: string, agentId: string | null, errorMessage?: string) => {
      const { error } = await supabase.from('call_logs').insert({
        agent_id: agentId,
        from_number: from,
        to_number: to,
        status,
        error_message: errorMessage ?? null,
      })
      if (error) console.error('[twilio/incoming-call] call_logs-skrivning misslyckades:', error.message)
    }

    // ── Resolve the number ────────────────────────────────────────────────
    // Normalised to E.164 and matched exactly. The previous version compared
    // only the last 9 digits across the first 50 rows, which could match a
    // different country's number and silently ignored row 51 onwards.
    const parsed = normalizeE164(to)
    const e164 = parsed.ok ? parsed.e164 : to

    let agentId: string | null = null

    const { data: exact } = await supabase
      .from('phone_numbers')
      .select('agent_id')
      .eq('phone_number', e164)
      .maybeSingle()

    if (exact?.agent_id) {
      agentId = exact.agent_id
    } else {
      // Legacy rows may carry spaces or a 00-prefix. Compare full digit
      // strings — not a suffix — so two different numbers cannot collide.
      const wantDigits = e164.replace(/\D/g, '')
      const { data: all } = await supabase.from('phone_numbers').select('agent_id, phone_number')
      const hit = (all ?? []).find(n => (n.phone_number ?? '').replace(/\D/g, '') === wantDigits)
      agentId = hit?.agent_id ?? null
    }

    if (!agentId) {
      await log('unrouted', null, `Inget nummer i phone_numbers matchar ${e164} (samtal ${callSid})`)
      return sayError('Det här numret är inte kopplat till någon agent.')
    }

    // ── Resolve the agent ─────────────────────────────────────────────────
    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .select('id, name, status, prompt_text, welcome_message, language, voice_id')
      .eq('id', agentId)
      .maybeSingle()

    if (agentErr || !agent) {
      await log('error', agentId, `Agenten ${agentId} kunde inte hämtas (samtal ${callSid})`)
      return sayError('Agenten kunde inte hittas.')
    }

    // A paused or draft agent should not answer. This was not checked at all
    // before — a paused agent still took live calls.
    if (agent.status !== 'deployed') {
      await log('rejected', agent.id, `Agenten är ${agent.status}, inte deployed (samtal ${callSid})`)
      return sayError('Den här tjänsten är pausad just nu. Var god försök igen senare.')
    }

    // ── Hand off to ElevenLabs ────────────────────────────────────────────
    const elRes = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(elAgentId)}`,
      { headers: { 'xi-api-key': elApiKey } }
    )

    if (!elRes.ok) {
      const body = await elRes.text().catch(() => '')
      await log('error', agent.id, `ElevenLabs get_signed_url misslyckades (${elRes.status}) ${body.slice(0, 160)}`)
      return sayError('Kunde inte ansluta till AI-agenten just nu.')
    }

    const { signed_url: signedUrl } = await elRes.json()
    if (!signedUrl) {
      await log('error', agent.id, `ElevenLabs returnerade ingen signed_url (samtal ${callSid})`)
      return sayError('Kunde inte ansluta till AI-agenten just nu.')
    }

    await log('in_progress', agent.id)

    // The agent's own prompt, greeting, language and voice travel as stream
    // parameters. See the limitation note at the top of this file: they are
    // sent correctly, but whether this ElevenLabs endpoint honours them is
    // unverified.
    const language = agent.language === 'en' ? 'en' : 'sv'
    const parameters: Array<[string, string]> = [
      ['language', language],
      ['agent_name', agent.name ?? ''],
    ]
    if (agent.prompt_text) parameters.push(['prompt', agent.prompt_text])
    if (agent.welcome_message) parameters.push(['first_message', agent.welcome_message])
    if (agent.voice_id) parameters.push(['voice_id', agent.voice_id])

    const paramXml = parameters
      .map(([name, value]) => `<Parameter name="${xmlEscape(name)}" value="${xmlEscape(value)}" />`)
      .join('')

    return twiml(
      `<Response><Connect><Stream url="${xmlEscape(signedUrl)}">${paramXml}</Stream></Connect></Response>`
    )
  } catch (err) {
    // Nothing above may reach the caller as a 500 — that produces Twilio's own
    // "application error" recording instead of our message.
    console.error('[twilio/incoming-call] Oväntat fel:', err)
    return sayError('Ett tekniskt fel uppstod. Var god försök igen senare.')
  }
}
