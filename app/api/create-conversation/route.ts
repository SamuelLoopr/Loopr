import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Fallbacks used only when the agent's own field is empty in our database.
// Previously an empty prompt_text/welcome_message meant we sent NO override
// at all for that field, which made the call silently fall back to
// ElevenLabs' raw agent defaults — an English system prompt ("You are a
// helpful assistant") and English first message ("Hello! How can I help you
// today?"). That's very likely why agents without a fully generated prompt
// spoke English regardless of the language setting: the LLM had zero
// language instruction to go on. Every call now always gets an explicit
// Swedish (or English) instruction, generated or not.
const DEFAULT_PROMPT_SV = 'Du är en AI-receptionist för ett svenskt lokalt serviceföretag. Svara alltid vänligt och professionellt.'
const DEFAULT_PROMPT_EN = 'You are an AI receptionist for a local service business. Always respond politely and professionally.'
const DEFAULT_WELCOME_SV = 'Hej! Hur kan jag hjälpa dig?'
const DEFAULT_WELCOME_EN = 'Hello! How can I help you today?'

// Prepended to every prompt regardless of source — the per-conversation
// "language" override sets ASR/TTS language, but doesn't reliably force
// every backup LLM in ElevenLabs' fallback chain to respond in Swedish.
// An explicit instruction in the prompt text itself is the most robust way
// to guarantee it across all of them.
const LANGUAGE_ENFORCEMENT_SV = 'VIKTIGT: Du ska ALLTID svara på svenska, oavsett vilket språk kunden använder. Använd aldrig engelska.\n\n'

export async function POST(req: NextRequest) {
  const { agentId } = await req.json()

  const elApiKey = process.env.ELEVENLABS_API_KEY
  const elAgentId = process.env.ELEVENLABS_AGENT_ID

  if (!elApiKey) {
    return NextResponse.json(
      { error: 'ELEVENLABS_API_KEY saknas i servermiljön (.env.local)' },
      { status: 500 }
    )
  }
  if (!elAgentId) {
    return NextResponse.json(
      { error: 'ELEVENLABS_AGENT_ID saknas i servermiljön (.env.local)' },
      { status: 500 }
    )
  }

  // Fetch agent prompt & welcome message from Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: agent, error: dbError } = await supabase
    .from('agents')
    .select('prompt_text, welcome_message, language, voice_id')
    .eq('id', agentId)
    .single()

  if (dbError || !agent) {
    return NextResponse.json({ error: 'Agent hittades inte i databasen' }, { status: 404 })
  }

  // Get one-time signed WebSocket URL from ElevenLabs
  const elRes = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(elAgentId)}`,
    { headers: { 'xi-api-key': elApiKey } }
  )

  if (!elRes.ok) {
    const errText = await elRes.text()
    return NextResponse.json(
      { error: `ElevenLabs API-fel (${elRes.status}): ${errText}` },
      { status: elRes.status }
    )
  }

  const { signed_url } = await elRes.json()

  const language = agent.language === 'en' ? 'en' : 'sv'
  const isSwedish = language === 'sv'

  const basePrompt = agent.prompt_text || (isSwedish ? DEFAULT_PROMPT_SV : DEFAULT_PROMPT_EN)
  const prompt = isSwedish ? LANGUAGE_ENFORCEMENT_SV + basePrompt : basePrompt
  const welcomeMessage = agent.welcome_message || (isSwedish ? DEFAULT_WELCOME_SV : DEFAULT_WELCOME_EN)

  // Fetched fresh from Supabase on every call (no caching). Logged so a
  // missing prompt/voice — and the resulting silent fallback to defaults —
  // is visible in the server log immediately, not just as "sounds English"
  // after the fact.
  console.log(`[create-conversation] agent=${agentId} language=${language} voice_id=${agent.voice_id || '(none)'} usedDefaultPrompt=${!agent.prompt_text} usedDefaultWelcome=${!agent.welcome_message}`)

  return NextResponse.json({
    signedUrl: signed_url,
    prompt,
    welcomeMessage,
    language,
    voiceId: agent.voice_id || '',
  })
}
