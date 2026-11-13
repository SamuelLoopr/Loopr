import type { SupabaseClient } from '@supabase/supabase-js'

// Loggar varje körning av kontrollerna i cron_runs (053), även när allt är
// bra. Kastar aldrig: en logg som inte går att skriva får inte fälla kontrollen.

export type CronJob = 'health' | 'long_calls'

export async function logCronRun(
  supabase: SupabaseClient,
  run: { job: CronJob; ranAt: Date; ok: boolean; problems: number; alert: string | null; durationMs: number },
): Promise<void> {
  try {
    const { error } = await supabase.from('cron_runs').insert({
      job: run.job,
      ran_at: run.ranAt.toISOString(),
      ok: run.ok,
      problems: run.problems,
      alert: run.alert,
      duration_ms: Math.round(run.durationMs),
    })
    if (error) console.error(`[cron-runs] Kunde inte logga ${run.job}: ${error.message}`)
  } catch (err) {
    console.error('[cron-runs] Kastade:', err)
  }
}
