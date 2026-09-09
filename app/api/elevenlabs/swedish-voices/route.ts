import { NextResponse } from 'next/server'

// ElevenLabs' shared/public Voice Library, filtered to genuinely Swedish
// voices (locale sv-SE) — distinct from /api/elevenlabs/voices, which only
// lists voices already in this account. Most premade voices in a fresh
// account are English-trained; they *can* speak Swedish via a multilingual
// model but carry an English accent doing it. These are native Swedish
// voices that need a one-time import (see /api/elevenlabs/voices/add)
// before they're usable as a voice_id.
export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ELEVENLABS_API_KEY saknas' }, { status: 500 })

  const res = await fetch('https://api.elevenlabs.io/v1/shared-voices?language=sv&page_size=30', {
    headers: { 'xi-api-key': apiKey },
  })

  if (!res.ok) {
    const errText = await res.text()
    return NextResponse.json({ error: `ElevenLabs API-fel (${res.status}): ${errText}` }, { status: res.status })
  }

  const data = await res.json()
  interface SharedVoice {
    voice_id: string
    public_owner_id: string
    name: string
    gender?: string
    accent?: string
    preview_url?: string
  }
  const voices = ((data.voices || []) as SharedVoice[]).map(v => ({
    voiceId: v.voice_id,
    publicOwnerId: v.public_owner_id,
    name: v.name,
    gender: v.gender ?? null,
    accent: v.accent ?? null,
    previewUrl: v.preview_url ?? null,
  }))

  return NextResponse.json({ voices })
}
