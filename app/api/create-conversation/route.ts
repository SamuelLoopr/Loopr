import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { buildSystemPrompt, DEFAULT_PROMPT, DEFAULT_WELCOME } from '@/lib/shared-prompt'

// Standardtexter när agentens egna fält är tomma, och de gemensamma reglerna
// (språk + att faktiskt lägga på), ligger i lib/shared-prompt.ts — delade med
// telefonvägen och den publika demosidan. Ett tomt prompt_text betydde
// tidigare att ingen override alls skickades, vilket tyst föll tillbaka på
// ElevenLabs engelska standardagent; nu får varje samtal alltid en uttrycklig
// instruktion, genererad eller inte.

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
  // Acts as the signed-in user rather than as anon: middleware.ts already
  // guarantees a session on this route, and the authenticated-only RLS policies
  // in 019_auth_rls.sql would reject these reads and writes from the anon role.
  const supabase = await createSupabaseServerClient()
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
  const prompt = buildSystemPrompt(agent.prompt_text || DEFAULT_PROMPT[language], language)
  const welcomeMessage = agent.welcome_message || DEFAULT_WELCOME[language]

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
