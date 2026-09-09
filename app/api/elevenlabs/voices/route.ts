import { NextResponse } from 'next/server'

// Real voice IDs from the connected ElevenLabs account — replaces the old
// hardcoded label list (freya/erik/maja/lars) whose "ids" were just display
// names, not valid ElevenLabs voice IDs. Sending a display name as
// overrides.tts.voiceId gets silently ignored by ElevenLabs, which is why
// voice changes never had any audible effect.
export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ELEVENLABS_API_KEY saknas i servermiljön (.env.local)' }, { status: 500 })
  }

  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': apiKey },
  })

  if (!res.ok) {
    const errText = await res.text()
    return NextResponse.json({ error: `ElevenLabs API-fel (${res.status}): ${errText}` }, { status: res.status })
  }

  const data = await res.json()
  const voices = (data.voices || []).map((v: { voice_id: string; name: string; labels?: Record<string, string> }) => ({
    voiceId: v.voice_id,
    name: v.name,
    language: v.labels?.language ?? null,
    accent: v.labels?.accent ?? null,
  }))

  return NextResponse.json({ voices })
}
