import type { SupabaseClient } from '@supabase/supabase-js'
import { sendOpsAlert } from '@/lib/ops-alert'

// Linjer som fastnat hos 46elks. Den 9 november 2026 låg ett samtal
// uppkopplat i 12 timmar (72 kr) när ElevenLabs svarat utan agent och
// SIP-avslutet tappats på vägen. ElevenLabs gräns på 10 minuter hjälper inte
// då, och 46elks har ingen dokumenterad tidsgräns i connect.
//
// Läser 46elks samtalshistorik: pågående samtal äldre än LONG_CALL_S, och
// avslutade samtal som varade längre än så. Inga telefonnummer lämnar
// funktionen — bara samtals-id, start och längd.

/** Uppkopplat längre än så här räknas som en linje som fastnat. */
export const LONG_CALL_S = 15 * 60

export interface LongCall { id: string; startedAt: string; seconds: number; ongoing: boolean }

export async function findLongCalls(now: Date = new Date(), sinceMs = 24 * 60 * 60 * 1000): Promise<LongCall[] | null> {
  const user = process.env.ELKS_API_USERNAME?.trim(), pass = process.env.ELKS_API_PASSWORD?.trim()
  if (!user || !pass) return null
  try {
    const res = await fetch('https://api.46elks.com/a1/calls?limit=100', {
      headers: { authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { data?: { id: string; created: string; state: string; duration?: number }[] }
    const out: LongCall[] = []
    for (const c of body.data ?? []) {
      // 46elks skriver UTC utan "Z".
      const started = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(c.created) ? c.created : `${c.created}Z`)
      if (now.getTime() - started.getTime() > sinceMs) continue
      const ongoing = c.state === 'ongoing'
      const seconds = ongoing ? Math.round((now.getTime() - started.getTime()) / 1000) : (c.duration ?? 0)
      if (seconds > LONG_CALL_S) out.push({ id: c.id, startedAt: started.toISOString(), seconds, ongoing })
    }
    return out
  } catch {
    return null
  }
}

const TIME = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function describeLongCall(c: LongCall): string {
  const min = Math.round(c.seconds / 60)
  return c.ongoing
    ? `Ett samtal har varit uppkopplat hos 46elks i ${min} min och pågår fortfarande (start ${TIME.format(new Date(c.startedAt))}, ${c.id}).`
    : `Ett samtal var uppkopplat hos 46elks i ${min} min (start ${TIME.format(new Date(c.startedAt))}, ${c.id}).`
}

/**
 * Direkt varning för pågående linjer som fastnat. Anropas vid varje nytt
 * inkommande samtal och vid post-call (efter svaret), högst en varning i
 * timmen. Returnerar antalet linjer (null = 46elks gick inte att läsa) och
 * varningens utfall, för loggen i cron_runs. Kastar aldrig.
 */
export async function alertOngoingLongCalls(
  supabase: SupabaseClient,
): Promise<{ stuck: number | null; alert: string | null }> {
  try {
    const found = await findLongCalls(new Date(), 2 * 60 * 60 * 1000)
    const stuck = found?.filter(c => c.ongoing) ?? []
    const alert = stuck.length ? await sendOpsAlert(supabase, 'long_call', stuck.map(describeLongCall).join('\n')) : null
    return { stuck: found === null ? null : stuck.length, alert }
  } catch (err) {
    console.error('[long-calls] Kastade:', err)
    return { stuck: null, alert: null }
  }
}
