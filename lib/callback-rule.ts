import type { SupabaseClient } from '@supabase/supabase-js'
import { CALLBACK_PLACEHOLDER, parseCallbackRule, type CallbackRule } from '@/lib/callback-time'

/**
 * Agentens återuppringningsregel (agents.callback_rule, 046), eller null =
 * standardregeln. Frågar databasen bara när prompten lovar en tid
 * ({{ATERUPPRINGNING}}) — för alla andra agenter blir det ingen extra läsning.
 * Varje fel ger null, alltså dagens beteende. Kastar aldrig.
 */
export async function callbackRuleFor(
  supabase: SupabaseClient,
  agentId: string,
  promptText: string | null | undefined,
): Promise<CallbackRule | null> {
  if (!promptText?.includes(CALLBACK_PLACEHOLDER)) return null
  try {
    const { data, error } = await supabase.from('agents').select('callback_rule').eq('id', agentId).maybeSingle()
    if (error || !data) return null
    return parseCallbackRule((data as { callback_rule?: unknown }).callback_rule)
  } catch {
    return null
  }
}
