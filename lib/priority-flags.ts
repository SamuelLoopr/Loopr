import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * agents.priority_flags (051): analysen bedömer brådskande och företag. Fel
 * eller saknad kolumn ger false, alltså analysen exakt som förut.
 */
export async function wantsPriorityFlags(supabase: SupabaseClient, agentId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from('agents').select('priority_flags').eq('id', agentId).maybeSingle()
    return !error && (data as { priority_flags?: boolean } | null)?.priority_flags === true
  } catch {
    return false
  }
}

/** "Brådskande: " och/eller "Företag: " före mejlets ämne. Tom utan flaggor. */
export function subjectPrefix(flags: { urgent?: boolean | null; business?: boolean | null }): string {
  return `${flags.urgent ? 'Brådskande: ' : ''}${flags.business ? 'Företag: ' : ''}`
}
