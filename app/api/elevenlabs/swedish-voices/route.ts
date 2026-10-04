import { NextResponse } from 'next/server'

// ElevenLabs delade röstbibliotek, filtrerat till genuint svenska röster —
// till skillnad från /api/elevenlabs/voices, som listar det som redan finns i
// kontot. En röst härifrån måste importeras en gång
// (/api/elevenlabs/voices/add) innan den går att använda som voice_id.
//
// Uppmätt mot API:et 2026-10-01:
//
// 1. ?language=sv SORTERAR svenska först men FILTRERAR INTE. total_count blir
//    2176, och efter de 59 faktiskt svenska rösterna fylls sidorna på med
//    engelska, hindi, tyska och annat. Med page_size=30 märktes det inte — de
//    30 första är svenska — men allt därutöver kräver att språket kontrolleras
//    här i stället för att lita på frågan.
//
// 2. Biblioteket innehåller 59 svenska röster totalt. Den gamla varianten
//    hämtade 30 utan paginering och kunde alltså aldrig visa mer än hälften.

const PAGE_SIZE = 100
const MAX_PAGES = 25

/**
 * Röster med kreditmultiplikator över 1 utelämnas: de drar 2–3x krediter för
 * samma talmängd. Antalet rapporteras tillbaka så gränssnittet kan nämna att de
 * finns, i stället för att tyst dölja dem.
 */
const MAX_RATE = 1

interface SharedVoice {
  voice_id: string
  public_owner_id: string
  name: string
  language?: string
  locale?: string
  gender?: string
  accent?: string
  preview_url?: string
  rate?: number
  is_added_by_user?: boolean
  /** Går inte att använda för agenter — se kommentaren vid mappningen nedan. */
  live_moderation_enabled?: boolean
}

const isSwedish = (v: SharedVoice) => v.locale === 'sv-SE' || v.language === 'sv'

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ELEVENLABS_API_KEY saknas' }, { status: 500 })

  const found = new Map<string, SharedVoice>()
  let pagesFetched = 0

  // Två frågor med olika urval, eftersom ingen av dem ensam ger alla 59:
  // locale=sv-SE har svenska utspridda över sina tre sidor, language=sv har
  // dem samlade på den första.
  for (const filter of ['locale=sv-SE', 'language=sv']) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const before = found.size
      const res = await fetch(
        `https://api.elevenlabs.io/v1/shared-voices?page_size=${PAGE_SIZE}&page=${page}&${filter}`,
        { headers: { 'xi-api-key': apiKey }, cache: 'no-store' },
      )
      if (!res.ok) {
        // Första sidan av första frågan är ett riktigt fel. Senare sidor har vi
        // redan träffar från och kan fortsätta utan.
        if (page === 0 && found.size === 0) {
          return NextResponse.json(
            { error: `ElevenLabs API-fel (${res.status}): ${await res.text()}` },
            { status: res.status },
          )
        }
        break
      }

      const data = await res.json()
      const voices = (data.voices ?? []) as SharedVoice[]
      pagesFetched++
      for (const v of voices) if (isSwedish(v)) found.set(v.voice_id, v)

      if (voices.length === 0 || !data.has_more) break
      // En hel sida utan en enda ny svensk röst betyder att vi har passerat
      // dem: language=sv har alla sina på första sidan och fortsätter sedan med
      // 2000+ andra språk. Utan det här blir routen 25 anrop i stället för 5.
      if (found.size === before) break
    }
  }

  const all = [...found.values()]
  const excludedHighRate = all.filter(v => (v.rate ?? 1) > MAX_RATE).length

  const voices = all
    .filter(v => (v.rate ?? 1) <= MAX_RATE)
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
    .map(v => ({
      voiceId: v.voice_id,
      publicOwnerId: v.public_owner_id,
      name: v.name,
      gender: v.gender ?? null,
      accent: v.accent ?? null,
      previewUrl: v.preview_url ?? null,
      alreadyAdded: v.is_added_by_user === true,
      /**
       * Röster med live moderation kan inte användas för agenter: ElevenLabs
       * stänger konversationen med close 1008. Fältet följer med redan här,
       * på biblioteksnivå, så en sådan röst kan flaggas INNAN den importeras
       * — annars tar den en plats i kontot utan att kunna användas.
       */
      liveModerationEnabled: v.live_moderation_enabled === true,
    }))

  return NextResponse.json({
    voices,
    /** Hur många svenska röster biblioteket innehåller totalt. */
    totalSwedish: all.length,
    /** Utelämnade på grund av kreditmultiplikator — se MAX_RATE ovan. */
    excludedHighRate,
    pagesFetched,
  })
}
