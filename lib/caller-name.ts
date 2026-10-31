import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * "Samuel Hallson" -> "Samuel H.", "Olof Von Welius" -> "Olof V.", "Elvi" ->
 * "Elvi". Förnamnet plus första bokstaven i nästa ord, med punkt. Ett namn som
 * inte ser ut som ett personnamn (siffror, bara ett tecken) lämnas som det är.
 */
export function shortCallerName(name: string | null): string | null {
  if (!name) return name
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return name.trim() || null
  const initial = [...parts[1]][0]
  if (!initial || !/\p{L}/u.test(initial)) return name.trim()
  const first = parts[0][0].toLocaleUpperCase('sv') + parts[0].slice(1)
  return `${first} ${initial.toLocaleUpperCase('sv')}.`
}

/**
 * agents.short_caller_name (047). Fel eller saknad kolumn ger false, alltså
 * hela namnet som förut.
 */
export async function wantsShortCallerName(supabase: SupabaseClient, agentId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from('agents').select('short_caller_name').eq('id', agentId).maybeSingle()
    return !error && (data as { short_caller_name?: boolean } | null)?.short_caller_name === true
  } catch {
    return false
  }
}
