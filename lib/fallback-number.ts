import type { SupabaseClient } from '@supabase/supabase-js'

// Reservnumret (052): om ElevenLabs inte svarar kopplar 46elks samtalet dit i
// stället för att den som ringer möter en död linje.
//
// Av för alla tills agents.fallback_number sätts. Ett reservnummer som är ett
// av Loopr-numren (alla agenters, inte bara den här) används aldrig: det
// skulle koppla samtalet tillbaka hit i en loop. Samma kontroll finns som
// trigger i databasen; den här är andra spärren, vid varje samtal.
//
// Hur: 46elks `failed`/`busy` räcker inte. När agenten inte var tillgänglig
// (call_initialization_error, 9–10 november 2026) svarade ElevenLabs ändå på
// SIP-anropet och 46elks rapporterade success. I stället får connect ett
// `next`: när benet till ElevenLabs tar slut och den som ringer fortfarande är
// kvar frågar 46elks oss vad som ska hända (app/api/46elks/[token]/after-connect).
// Var benet kortare än FALLBACK_WITHIN_S kopplas samtalet till reserven —
// agenten kan inte lägga på själv på SIP-vägen, så ett så kort ben med
// uppringaren kvar betyder att ElevenLabs släppte samtalet. Ska testas på ett
// riktigt samtal innan det slås på.
//
// Ingen `timeout`: 46elks dokumenterar inte vad den betyder (ringtid eller
// längsta samtalslängd). Läggs till först när deras support svarat.

/** Ett ben till ElevenLabs kortare än så här, med uppringaren kvar, ger reserven. */
export const FALLBACK_WITHIN_S = 30

const digits = (n: string) => n.replace(/\D/g, '')

/** Reservnumret om det får användas, annars null. */
export function usableFallback(fallback: string | null | undefined, looprNumbers: string[], dialled: string): string | null {
  const f = fallback?.trim()
  if (!f || !/^\+[1-9]\d{7,14}$/.test(f)) return null
  const own = new Set([...looprNumbers, dialled].map(digits))
  return own.has(digits(f)) ? null : f
}

/**
 * 46elks call action: bara SIP som i dag, eller SIP med `next` till
 * after-connect när en reserv finns. nextUrl bär starttiden (t) så att
 * after-connect vet hur länge benet varade.
 */
export function connectAction(sipUri: string, fallback: string | null, nextUrl: string | null): Record<string, unknown> {
  if (!fallback || !nextUrl) return { connect: sipUri }
  return { connect: sipUri, next: nextUrl }
}

/** Vad after-connect svarar: reserven om benet var kort, annars lägg på. */
export function afterConnectAction(fallback: string | null, startedAtMs: number, nowMs: number): Record<string, unknown> {
  const seconds = (nowMs - startedAtMs) / 1000
  if (fallback && Number.isFinite(seconds) && seconds >= 0 && seconds < FALLBACK_WITHIN_S) return { connect: fallback }
  return { hangup: 'busy' }
}

/**
 * agents.fallback_number och alla Loopr-nummer. Fel eller saknad kolumn ger
 * null, alltså dagens beteende.
 */
export async function loadFallback(supabase: SupabaseClient, agentId: string, dialled: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from('agents').select('fallback_number').eq('id', agentId).maybeSingle()
    const fallback = (data as { fallback_number?: string | null } | null)?.fallback_number
    if (error || !fallback) return null
    const { data: numbers, error: numbersError } = await supabase.from('phone_numbers').select('phone_number')
    if (numbersError) return null
    const usable = usableFallback(fallback, (numbers ?? []).map(n => n.phone_number as string), dialled)
    if (!usable) console.error(`[fallback-number] Reservnumret för agent ${agentId} är ett Loopr-nummer eller ogiltigt — används inte`)
    return usable
  } catch {
    return null
  }
}
