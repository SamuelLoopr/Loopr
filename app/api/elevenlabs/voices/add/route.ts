import { NextRequest, NextResponse } from 'next/server'

// Imports a voice from ElevenLabs' shared Voice Library into this account's
// own library — required before it can be referenced by voice_id in a
// conversation. Without this step, shared-library voice IDs (e.g. from
// /api/elevenlabs/swedish-voices) aren't usable at all.
export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ELEVENLABS_API_KEY saknas' }, { status: 500 })

  const { publicOwnerId, voiceId, name } = await req.json()
  if (!publicOwnerId || !voiceId || !name) {
    return NextResponse.json({ error: 'publicOwnerId, voiceId och name krävs' }, { status: 400 })
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/voices/add/${publicOwnerId}/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_name: name }),
  })

  if (!res.ok) {
    const errText = await res.text()
    return NextResponse.json({ error: `ElevenLabs API-fel (${res.status}): ${errText}` }, { status: res.status })
  }

  const data = await res.json()
  return NextResponse.json({ voiceId: data.voice_id })
}
