import { NextRequest, NextResponse } from 'next/server'

// Applies voice tuning to the shared ElevenLabs agent.
//
// stability, similarity_boost and speed cannot be sent per conversation: the
// browser SDK builds its override message with only `tts: { voice_id }` and
// drops every other tts field, even though the agent's override permissions
// allow all four. PATCHing the agent is the only mechanism that takes effect.
//
// That agent is shared by every Loopr demo (one ELEVENLABS_AGENT_ID), so this
// is a global write. The per-agent values live in Supabase and are pushed here
// right before a demo starts — see app/api/public-agent/[shareId]/route.ts.
//
// Protected by middleware.ts (the /api/elevenlabs prefix requires a session).

export interface VoiceSettings {
  stability: number
  similarityBoost: number
  speed: number
}

/** ElevenLabs rejects out-of-range values; clamp rather than fail the save. */
function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, v))
}

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY
  const agentId = process.env.ELEVENLABS_AGENT_ID
  if (!apiKey || !agentId) {
    return NextResponse.json({ error: 'ElevenLabs-nycklar saknas i servermiljön.' }, { status: 500 })
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, {
    headers: { 'xi-api-key': apiKey },
  })
  if (!res.ok) {
    return NextResponse.json(
      { error: `Kunde inte läsa agentens röstinställningar (${res.status}).` },
      { status: res.status }
    )
  }

  const data = await res.json()
  const tts = data?.conversation_config?.tts ?? {}
  return NextResponse.json({
    stability: tts.stability ?? 0.5,
    similarityBoost: tts.similarity_boost ?? 0.8,
    speed: tts.speed ?? 1.0,
    // Returned for display only — model_id has override: false, so it can only
    // be changed in the ElevenLabs console.
    modelId: tts.model_id ?? null,
    voiceId: tts.voice_id ?? null,
  })
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  const agentId = process.env.ELEVENLABS_AGENT_ID
  if (!apiKey || !agentId) {
    return NextResponse.json({ error: 'ElevenLabs-nycklar saknas i servermiljön.' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const settings: VoiceSettings = {
    stability: clamp(body.stability, 0, 1, 0.5),
    similarityBoost: clamp(body.similarityBoost, 0, 1, 0.8),
    speed: clamp(body.speed, 0.7, 1.2, 1.0),
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      conversation_config: {
        tts: {
          stability: settings.stability,
          similarity_boost: settings.similarityBoost,
          speed: settings.speed,
        },
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    return NextResponse.json(
      { error: `ElevenLabs avvisade inställningarna (${res.status}): ${errText.slice(0, 200)}` },
      { status: res.status }
    )
  }

  const data = await res.json()
  const tts = data?.conversation_config?.tts ?? {}
  // Echo back what ElevenLabs actually stored, not what we sent — that is the
  // only way to be sure the change landed.
  return NextResponse.json({
    applied: {
      stability: tts.stability,
      similarityBoost: tts.similarity_boost,
      speed: tts.speed,
    },
  })
}
