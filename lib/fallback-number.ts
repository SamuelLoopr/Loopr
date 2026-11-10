import type { SupabaseClient } from '@supabase/supabase-js'

// Reservnumret (052): om ElevenLabs inte svarar kopplar 46elks samtalet dit i
// stället för att den som ringer möter en död linje.
//
// Av för alla tills agents.fallback_number sätts. Ett reservnummer som är ett
// av Loopr-numren (alla agenters, inte bara den här) används aldrig: det
// skulle koppla samtalet tillbaka hit i en loop. Samma kontroll finns som
// trigger i databasen; den här är andra spärren, vid varje samtal.
//
// OBS: 46elks går bara till `failed`/`busy` om SIP-benet inte kopplas upp.
// Om ElevenLabs svarar och sedan lägger på direkt (call_initialization_error
// i november 2026) märker 46elks inget. Ska testas på ett riktigt samtal
// innan det slås på.

/** Sekunder 46elks väntar på att ElevenLabs svarar innan reserven tar över. */
export const FALLBACK_TIMEOUT_S = 15

const digits = (n: string) => n.replace(/\D/g, '')

/** Reservnumret om det får användas, annars null. */
export function usableFallback(fallback: string | null | undefined, looprNumbers: string[], dialled: string): string | null {
  const f = fallback?.trim()
  if (!f || !/^\+[1-9]\d{7,14}$/.test(f)) return null
  const own = new Set([...looprNumbers, dialled].map(digits))
  return own.has(digits(f)) ? null : f
}

/** 46elks call action: bara SIP som i dag, eller SIP med reserven vid fel. */
export function connectAction(sipUri: string, fallback: string | null): Record<string, unknown> {
  if (!fallback) return { connect: sipUri }
  return { connect: sipUri, timeout: String(FALLBACK_TIMEOUT_S), failed: { connect: fallback }, busy: { connect: fallback } }
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
