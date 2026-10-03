import { NextRequest, NextResponse, after } from 'next/server'
import crypto from 'node:crypto'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { buildSystemPrompt, DEFAULT_PROMPT, DEFAULT_WELCOME } from '@/lib/shared-prompt'
import { recordSipCall } from '@/lib/call-ingest'
import { isMissingColumn } from '@/lib/db-errors'

// ElevenLabs conversation initiation webhook: ett samtal är på väg in, och de
// frågar oss vem agenten ska vara.
//
// Det här är vad som gör att SIP-vägen kan dela EN ElevenLabs-agent mellan alla
// kunder, precis som Twilio-vägen gör. Med SIP är numret bundet till en agent
// hos ElevenLabs, så kundens egen prompt, röst och språk måste komma härifrån.
// Ur deras dokumentation, ordagrant: "The webhook runs for a new inbound
// conversation on Twilio voice, Exotel, SIP trunk, WhatsApp, or Twilio SMS".
//
// Samma lib/shared-prompt.ts som telefonvägen och testsamtalen använder, helt
// oförändrad — annars skulle den nya vägen tappa språkregeln och
// end_call-instruktionen, vilket är exakt det fel som en gång gjorde att
// skarpa kundsamtal saknade dem.
//
// ── DEN HÄR ROUTEN FÅR INTE VARA LÅNGSAM OCH FÅR INTE SVARA FEL ─────────────
// ElevenLabs dokumentation, ordagrant: "A failed or timed-out webhook can
// prevent the conversation from starting." Till skillnad från våra andra
// routes, där ett fel bara betyder att något dröjer till nästa sidladdning,
// dör samtalet här. Därför:
//
//   * den svarar ALLTID 200 med en giltig conversation_initiation_client_data,
//     även när databasen är nere eller numret inte går att slå upp. Utan
//     overrides svarar agenten med sina egna standardvärden — ett sämre samtal
//     är oändligt mycket bättre än inget samtal.
//   * uppslagningen har en hård tidsbudget. Hinner den inte svarar vi utan
//     overrides i stället för att låta den som ringt vänta.
//   * raden i call_logs skrivs EFTER svaret (next/server `after`), så loggning
//     aldrig kan fördröja ett samtal.
//
// SÄKERHET: ogissbar token i vägen plus en hemlig header som sätts i
// ElevenLabs agent-inställningar (request_headers). Två statiska hemligheter,
// alltså — starkare än 46elks-vägen, svagare än en HMAC-signatur över bodyn
// som Twilio och post-call-webhooken har.

export const dynamic = 'force-dynamic'

/** Headern vi låter ElevenLabs skicka. Sätts under Agents settings. */
const SECRET_HEADER = 'x-loopr-init-secret'

/**
 * Hur länge uppslagningen får ta innan vi svarar utan overrides.
 *
 * Tilltaget så att en normal fråga (en indexerad träff) hinner långt, men
 * kort nog att den som ringt inte märker det. ElevenLabs egen tidsgräns är
 * inte dokumenterad, så den här är satt för att alltid vara den som löser ut
 * först.
 */
const LOOKUP_BUDGET_MS = 2_500

interface InitRequest {
  caller_id?: string | null
  called_number?: string | null
  agent_id?: string | null
  call_sid?: string | null
  conversation_id?: string | null
  call_id?: string | null
  sip_headers?: Record<string, unknown> | null
}

/** Det minsta giltiga svaret: agentens egna standardvärden gäller. */
const PASSTHROUGH = { type: 'conversation_initiation_client_data' as const }

function equals(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const expectedToken = process.env.ELEVENLABS_INIT_TOKEN?.trim()
  if (!expectedToken || !token || !equals(expectedToken, token)) {
    console.warn('[conversation-init] Avvisad: token i URL:en stämmer inte')
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Headern är frivillig att konfigurera, men när den ÄR satt hos oss måste
  // den stämma. Annars vore det tysta skyddet värdelöst.
  const expectedSecret = process.env.ELEVENLABS_INIT_SECRET?.trim()
  if (expectedSecret) {
    const got = req.headers.get(SECRET_HEADER)?.trim()
    if (!got || !equals(expectedSecret, got)) {
      console.warn('[conversation-init] Avvisad: hemlig header saknas eller stämmer inte')
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  let body: InitRequest = {}
  try {
    body = (await req.json()) as InitRequest
  } catch {
    console.error('[conversation-init] Bodyn gick inte att tolka — svarar utan overrides')
    return NextResponse.json(PASSTHROUGH)
  }

  const calledNumber = body.called_number?.trim() || null
  const callerId = body.caller_id?.trim() || null
  const conversationId = body.conversation_id?.trim() || null

  // Allt härifrån är isolerat: vad som än går fel svarar vi 200 med något
  // ElevenLabs kan använda.
  let resolved: ResolvedAgent | null = null
  try {
    resolved = await Promise.race([
      resolveAgentForNumber(calledNumber),
      new Promise<null>(r => setTimeout(() => r(null), LOOKUP_BUDGET_MS)),
    ])
  } catch (err) {
    console.error('[conversation-init] Uppslagningen kastade:', err)
  }

  if (!resolved) {
    console.error(
      `[conversation-init] Ingen agent för ${calledNumber ?? 'okänt nummer'} ` +
      `(samtal ${conversationId ?? '?'}) — svarar utan overrides, agentens standard gäller`,
    )
  }

  // Loggningen efter svaret. Den som ringt ska aldrig vänta på vår databas.
  if (conversationId) {
    after(
      (async () => {
        try {
          const supabase = createSupabaseServiceClient()
          const result = await recordSipCall(supabase, {
            agentId: resolved?.id ?? null,
            callerId,
            calledNumber,
            conversationId,
          })
          console.log(`[conversation-init] call_logs: ${result} (${conversationId})`)
        } catch (err) {
          console.error('[conversation-init] Kunde inte logga samtalet:', err)
        }
      })(),
    )
  }

  if (!resolved) return NextResponse.json(PASSTHROUGH)

  const language = resolved.language === 'en' ? 'en' : 'sv'

  const tts: Record<string, unknown> = {}
  if (resolved.voiceId) tts.voice_id = resolved.voiceId
  if (resolved.stability != null) tts.stability = resolved.stability
  if (resolved.similarityBoost != null) tts.similarity_boost = resolved.similarityBoost
  if (resolved.speed != null) tts.speed = resolved.speed

  return NextResponse.json({
    type: 'conversation_initiation_client_data',
    conversation_config_override: {
      agent: {
        // Gemensamma regler + kundens egen text, samma funktion som
        // telefonvägen använder. Inte kundens prompt_text rakt av.
        // canEndCall: false — SIP-vägen tappar ElevenLabs SIP BYE, så end_call
        // avslutar konversationen medan telefonlinjen ligger kvar. Uppmätt tre
        // gånger 2026-10-03: 10–19 sekunder död linje efter agentens farväl.
        // Agenten ska därför ta farväl utan att lova att lägga på. Twilio-vägen
        // rörs inte — där fungerar end_call och behåller sitt standardläge.
        prompt: {
          prompt: buildSystemPrompt(resolved.promptText || DEFAULT_PROMPT[language], language, {
            canEndCall: false,
          }),
        },
        first_message: resolved.welcomeMessage || DEFAULT_WELCOME[language],
        language,
      },
      ...(Object.keys(tts).length > 0 ? { tts } : {}),
    },
  })
}

interface ResolvedAgent {
  id: string
  promptText: string | null
  welcomeMessage: string | null
  language: string | null
  voiceId: string | null
  stability: number | null
  similarityBoost: number | null
  speed: number | null
}

/**
 * Numret som ringdes -> kundens agent.
 *
 * Samma uppslagning som Twilio-vägen: exakt träff på phone_numbers, sedan
 * agenten. ElevenLabs skickar called_number i E.164 på SIP-samtal, så ingen
 * normalisering behövs — men jämförelsen på siffror finns kvar som skydd mot
 * äldre rader med mellanslag eller 00-prefix.
 */
async function resolveAgentForNumber(calledNumber: string | null): Promise<ResolvedAgent | null> {
  if (!calledNumber) return null

  const supabase = createSupabaseServiceClient()
  const { data: exact } = await supabase
    .from('phone_numbers')
    .select('agent_id')
    .eq('phone_number', calledNumber)
    .maybeSingle()

  let agentId = exact?.agent_id as string | undefined
  if (!agentId) {
    const wantDigits = calledNumber.replace(/\D/g, '')
    const { data: all } = await supabase.from('phone_numbers').select('agent_id, phone_number')
    agentId = (all ?? []).find(n => (n.phone_number ?? '').replace(/\D/g, '') === wantDigits)?.agent_id
  }
  if (!agentId) return null

  const COLS = 'id, prompt_text, welcome_message, language, voice_id, voice_stability, voice_similarity_boost, voice_speed'
  let res = await supabase.from('agents').select(COLS).eq('id', agentId).maybeSingle()
  if (res.error && isMissingColumn(res.error)) {
    res = await supabase.from('agents').select('id, prompt_text, welcome_message, language, voice_id').eq('id', agentId).maybeSingle()
  }
  if (res.error || !res.data) return null

  const a = res.data as Record<string, unknown>
  return {
    id: a.id as string,
    promptText: (a.prompt_text as string) ?? null,
    welcomeMessage: (a.welcome_message as string) ?? null,
    language: (a.language as string) ?? null,
    voiceId: (a.voice_id as string) ?? null,
    stability: (a.voice_stability as number) ?? null,
    similarityBoost: (a.voice_similarity_boost as number) ?? null,
    speed: (a.voice_speed as number) ?? null,
  }
}
