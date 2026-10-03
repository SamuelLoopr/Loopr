import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { buildSystemPrompt, DEFAULT_PROMPT, DEFAULT_WELCOME } from '@/lib/shared-prompt'

// Backs the public "prova agenten live" page (app/prova/[shareId]).
//
// Everything goes through this route rather than letting the public page
// query Supabase directly, so a prospect only ever receives the display
// fields we choose — never prompt_text (the business's full knowledge
// base), transfer_number, or the internal agent UUID.
//
// GET  → display info for the page
// POST → starts a conversation (signed ElevenLabs URL + overrides)

// Standardtexter och de gemensamma reglerna ligger i lib/shared-prompt.ts,
// delade med telefonvägen och dashboardens testsamtal.

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
    // select('*') rather than naming the voice_* columns: they arrive with
    // migration 023, and naming a column that does not exist yet makes
    // PostgREST reject the whole request — which would take the public voice
    // demo down until the migration runs. Only chosen fields are returned to
    // the browser further down, so this widens nothing for the caller.
    .select('*')
    .eq('public_share_id', shareId)
    .single()

  if (error || !agent) {
    return NextResponse.json({ error: 'Demon hittades inte' }, { status: 404 })
  }

  // Apply this agent's voice tuning before the conversation starts.
  //
  // stability/similarity_boost/speed cannot ride along as per-conversation
  // overrides — the browser SDK only forwards tts.voice_id — so they are pushed
  // onto the shared ElevenLabs agent here instead. voice_id still travels as a
  // real override, so it is unaffected by this.
  //
  // Because the ElevenLabs agent is shared by every demo, this write is global:
  // two demos started in the same second could see each other's tuning. For a
  // sales demo that is an acceptable trade; it would not be for concurrent
  // production calls.
  //
  // Deliberately non-fatal — a failed tuning write must not stop the call.
  const tuning: Record<string, number> = {}
  if (agent.voice_stability != null) tuning.stability = Number(agent.voice_stability)
  if (agent.voice_similarity_boost != null) tuning.similarity_boost = Number(agent.voice_similarity_boost)
  if (agent.voice_speed != null) tuning.speed = Number(agent.voice_speed)

  if (Object.keys(tuning).length > 0) {
    try {
      const tuneRes = await fetch(
        `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(elAgentId)}`,
        {
          method: 'PATCH',
          headers: { 'xi-api-key': elApiKey, 'content-type': 'application/json' },
          body: JSON.stringify({ conversation_config: { tts: tuning } }),
        }
      )
      if (!tuneRes.ok) {
        console.error(`[public-agent] Röstinställningar kunde inte tillämpas (${tuneRes.status}) för agent ${agent.id}`)
      }
    } catch (err) {
      console.error('[public-agent] Röstinställningar kunde inte tillämpas:', err)
    }
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

  return NextResponse.json({
    signedUrl: signed_url,
    prompt: buildSystemPrompt(agent.prompt_text || DEFAULT_PROMPT[language], language),
    welcomeMessage: agent.welcome_message || DEFAULT_WELCOME[language],
    language,
    voiceId: agent.voice_id || '',
  })
}
