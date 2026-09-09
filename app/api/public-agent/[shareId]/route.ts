import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

// Backs the public "prova agenten live" page (app/prova/[shareId]).
//
// Everything goes through this route rather than letting the public page
// query Supabase directly, so a prospect only ever receives the display
// fields we choose — never prompt_text (the business's full knowledge
// base), transfer_number, or the internal agent UUID.
//
// GET  → display info for the page
// POST → starts a conversation (signed ElevenLabs URL + overrides)

const DEFAULT_PROMPT_SV = 'Du är en AI-receptionist för ett svenskt lokalt serviceföretag. Svara alltid vänligt och professionellt.'
const DEFAULT_PROMPT_EN = 'You are an AI receptionist for a local service business. Always respond politely and professionally.'
const DEFAULT_WELCOME_SV = 'Hej! Hur kan jag hjälpa dig?'
const DEFAULT_WELCOME_EN = 'Hello! How can I help you today?'
const LANGUAGE_ENFORCEMENT_SV = 'VIKTIGT: Du ska ALLTID svara på svenska, oavsett vilket språk kunden använder. Använd aldrig engelska.\n\n'

// Runs for callers with no session, so it uses the service client:
// SUPABASE_SERVICE_ROLE_KEY when configured, otherwise the anon key it has
// always used. See lib/supabase-server.ts.
function supabaseClient() {
  return createSupabaseServiceClient()
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params

  const { data: agent, error } = await supabaseClient()
    .from('agents')
    .select('name, business_name, industry, description, services, status')
    .eq('public_share_id', shareId)
    .single()

  if (error || !agent) {
    return NextResponse.json({ error: 'Demon hittades inte' }, { status: 404 })
  }

  return NextResponse.json({
    agentName: agent.name,
    businessName: agent.business_name,
    industry: agent.industry,
    description: agent.description,
    services: agent.services,
    status: agent.status,
  })
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params

  const elApiKey = process.env.ELEVENLABS_API_KEY
  const elAgentId = process.env.ELEVENLABS_AGENT_ID
  if (!elApiKey || !elAgentId) {
    return NextResponse.json({ error: 'Röstdemon är inte konfigurerad just nu.' }, { status: 500 })
  }

  const supabase = supabaseClient()
  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, prompt_text, welcome_message, language, voice_id')
    .eq('public_share_id', shareId)
    .single()

  if (error || !agent) {
    return NextResponse.json({ error: 'Demon hittades inte' }, { status: 404 })
  }

  const elRes = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(elAgentId)}`,
    { headers: { 'xi-api-key': elApiKey } }
  )

  if (!elRes.ok) {
    const errText = await elRes.text()
    await supabase.from('call_logs').insert({
      agent_id: agent.id,
      status: 'error',
      error_message: `Publik demo: ElevenLabs get_signed_url misslyckades (${elRes.status}) ${errText}`,
    })
    return NextResponse.json({ error: 'Kunde inte starta samtalet just nu.' }, { status: 502 })
  }

  const { signed_url } = await elRes.json()

  const language = agent.language === 'en' ? 'en' : 'sv'
  const isSwedish = language === 'sv'
  const basePrompt = agent.prompt_text || (isSwedish ? DEFAULT_PROMPT_SV : DEFAULT_PROMPT_EN)

  return NextResponse.json({
    signedUrl: signed_url,
    prompt: isSwedish ? LANGUAGE_ENFORCEMENT_SV + basePrompt : basePrompt,
    welcomeMessage: agent.welcome_message || (isSwedish ? DEFAULT_WELCOME_SV : DEFAULT_WELCOME_EN),
    language,
    voiceId: agent.voice_id || '',
  })
}
