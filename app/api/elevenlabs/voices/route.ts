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
  // preview_url finns på varje röst och är publikt hämtbar (200 audio/mpeg utan
  // API-nyckel, CORS *), så röstväljaren kan spela upp den direkt i webbläsaren.
  const voices = (data.voices || []).map(
    (v: {
      voice_id: string
      name: string
      labels?: Record<string, string>
      preview_url?: string
      sharing?: { live_moderation_enabled?: boolean } | null
    }) => ({
      voiceId: v.voice_id,
      name: v.name,
      language: v.labels?.language ?? null,
      accent: v.labels?.accent ?? null,
      previewUrl: v.preview_url ?? null,
      /**
       * Röster med live moderation GÅR INTE att använda för agenter.
       *
       * ElevenLabs stänger konversationen direkt med close 1008 och texten
       * "Voices with live moderation enabled cannot be used for agents".
       * Uppmätt 2026-10-03 på sex röster, tre modererade och tre rena: fältet
       * förutsade utfallet varje gång.
       *
       * Förhandslyssningen fungerar ändå — preview_url är en färdig ljudfil
       * och rör inte agenten — så felet går inte att upptäcka genom att
       * lyssna. Det måste flaggas i gränssnittet i stället.
       */
      liveModerationEnabled: v.sharing?.live_moderation_enabled === true,
    }),
  )

  return NextResponse.json({ voices })
}
