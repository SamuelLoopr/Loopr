// Operatörens egna betyg på rösterna (034_voice_ratings.sql).
//
// Ett verktyg för en mänsklig bedömning, inte ett mått vi kan räkna ut.
// Ljudkvalitet går inte att läsa ur ElevenLabs API och ingen modell hör
// skillnaden åt oss — betyget finns för att den som lyssnat ska slippa komma
// ihåg vad 55 röster lät som.
//
// Formen ligger här och inte i komponenten eftersom både röstväljaren och
// betygspanelen under den måste vara eniga om vad "favorit" betyder och hur
// listan sorteras. Visar de två olika ordningar är funktionen värdelös.

export interface VoiceRating {
  voiceId: string
  /** 1–5, eller null för en anteckning utan betyg. */
  rating: number | null
  note: string | null
}

/** Rader som kan sorteras och filtreras på betyg. */
export interface RatableVoice {
  voiceId: string
  name: string
  accent?: string | null
  language?: string | null
}

/**
 * Från hur många stjärnor en röst räknas som favorit.
 *
 * Fyra, inte tre: en favoritlista som innehåller halva biblioteket sparar
 * ingen tid, och det var tidsbesparingen som var hela poängen. Satt här så
 * filtret och eventuella märken aldrig kan tolka det olika.
 */
export const FAVOURITE_FROM = 4

export type VoiceSortKey = 'rating' | 'name' | 'swedish'

export const SORT_LABELS: Record<VoiceSortKey, string> = {
  rating: 'Mitt betyg',
  name: 'Namn',
  swedish: 'Svenska först',
}

export function isFavourite(r: VoiceRating | undefined): boolean {
  return (r?.rating ?? 0) >= FAVOURITE_FROM
}

/** Betyget som ett tal som går att sortera på. Obetygsatt hamnar sist. */
function ratingOf(ratings: Record<string, VoiceRating>, voiceId: string): number {
  return ratings[voiceId]?.rating ?? 0
}

/**
 * Sorterar rösterna enligt valt läge.
 *
 * Alla lägen faller tillbaka på namn som sista jämförelse, så ordningen är
 * stabil och listan inte hoppar runt mellan omritningar när flera röster har
 * samma betyg.
 */
export function sortVoices<T extends RatableVoice>(
  voices: readonly T[],
  key: VoiceSortKey,
  ratings: Record<string, VoiceRating>,
): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, 'sv')
  const list = [...voices]

  if (key === 'rating') {
    return list.sort((a, b) => ratingOf(ratings, b.voiceId) - ratingOf(ratings, a.voiceId) || byName(a, b))
  }
  if (key === 'swedish') {
    // Det tidigare beteendet: svenska röster först. Kvar som alternativ
    // eftersom de flesta förinspelade rösterna i ett nytt konto är
    // engelsktränade och låter engelskbrutna på svenska.
    return list.sort((a, b) => (b.language === 'sv' ? 1 : 0) - (a.language === 'sv' ? 1 : 0) || byName(a, b))
  }
  return list.sort(byName)
}

/** Hur många röster som är betygsatta, och hur många som är favoriter. */
export function ratingSummary(ratings: Record<string, VoiceRating>): { rated: number; favourites: number; noted: number } {
  const all = Object.values(ratings)
  return {
    rated: all.filter(r => r.rating != null).length,
    favourites: all.filter(isFavourite).length,
    noted: all.filter(r => (r.note ?? '').trim().length > 0).length,
  }
}
