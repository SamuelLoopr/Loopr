import { NextResponse } from 'next/server'

// Read-only diagnostic: the Conversational AI agent's TTS model, default
// language, and which languages/override permissions are actually enabled
// live on ElevenLabs' side — this config lives on the agent (dashboard),
// not in anything our API calls can override per-conversation.
export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY
  const agentId = process.env.ELEVENLABS_AGENT_ID
  if (!apiKey) return NextResponse.json({ error: 'ELEVENLABS_API_KEY saknas' }, { status: 500 })
  if (!agentId) return NextResponse.json({ error: 'ELEVENLABS_AGENT_ID saknas' }, { status: 500 })

  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    headers: { 'xi-api-key': apiKey },
  })

  if (!res.ok) {
    const errText = await res.text()
    return NextResponse.json({ error: `ElevenLabs API-fel (${res.status}): ${errText}` }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json(data)
}
