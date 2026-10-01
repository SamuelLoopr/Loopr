import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isMissingColumn } from '@/lib/db-errors'
import { syncCallCosts } from '@/lib/cost-sync'
import { sumCosts, usdToSekRate, type CallCostRow } from '@/lib/service-pricing'

// Underlaget till dashboardsidan "Aktiva klienter": kostnad per klient och
// tjänst, för agenterna som är riktiga kunder (client_mode = true).
//
// SÄKERHET. Vanlig inloggad dashboard-route, ingen ny modell. Den ligger under
// /api/admin, som middleware.ts redan kräver session, godkänd adress och aktiv
// prenumeration för. Klienten (Supabase) agerar som den inloggade användaren,
// så RLS på agents och call_logs gäller precis som på övriga dashboardsidor —
// till skillnad från de publika BOS-routerna används ingen service-roll här.

export const dynamic = 'force-dynamic'

const PERIODS = { month: 'denna månad', days30: 'senaste 30 dagarna', all: 'all tid' } as const
export type PeriodKey = keyof typeof PERIODS

function periodStart(period: PeriodKey): string | null {
  const now = new Date()
  if (period === 'month') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  if (period === 'days30') return new Date(now.getTime() - 30 * 86_400_000).toISOString()
  return null
}

export interface ClientCostRow {
  agentId: string
  name: string
  phoneNumbers: string[]
  calls: number
  minutes: number
  costs: { twilioSek: number; elevenLabsSek: number; anthropicSek: number; totalSek: number }
  /** Månadspris klienten betalar (agents.monthly_price_sek). Null = inte satt. */
  monthlyPriceSek: number | null
  /** Pris minus kostnad. Null när priset inte är satt. */
  marginSek: number | null
  /** Samtal där Anthropic-kostnaden är en schablon, inte uppmätt. */
  estimatedCalls: number
  /** Samtal som saknar kostnad från respektive leverantör. */
  missingTwilio: number
  missingElevenLabs: number
}

export async function GET(req: NextRequest) {
  // 30 dagar som standard, inte kalendermånad: den 1:a i månaden hade annars
  // visat en helt tom sida trots att det finns gott om samtal.
  const period = (req.nextUrl.searchParams.get('period') ?? 'days30') as PeriodKey
  if (!(period in PERIODS)) {
    return NextResponse.json({ error: 'Okänd period.' }, { status: 400 })
  }

  const supabase = await createSupabaseServerClient()

  // Hämtar in nya kostnader från Twilio och ElevenLabs innan summeringen.
  // Får aldrig fälla sidan — utan den visas bara det som redan är hämtat.
  let syncNote: string | null = null
  try {
    const result = await syncCallCosts(supabase)
    if (result.unsupported) syncNote = 'migration'
  } catch (err) {
    console.error('[client-costs] Kostnadssynk misslyckades:', err)
    syncNote = 'sync'
  }

  // ── Klienterna ────────────────────────────────────────────────────────────
  let agentsRes = await supabase
    .from('agents')
    .select('id, name, business_name, monthly_price_sek')
    .eq('client_mode', true)
    .order('business_name', { ascending: true })

  let priceSupported = true
  if (agentsRes.error && isMissingColumn(agentsRes.error)) {
    priceSupported = false
    agentsRes = (await supabase
      .from('agents')
      .select('id, name, business_name')
      .eq('client_mode', true)
      .order('business_name', { ascending: true })) as typeof agentsRes
  }
  if (agentsRes.error) {
    // client_mode saknas (029 inte körd) — då finns inga klienter att visa.
    if (isMissingColumn(agentsRes.error)) {
      return NextResponse.json({ clients: [], rate: usdToSekRate(), period, note: 'migration' })
    }
    console.error('[client-costs] Kunde inte läsa agenter:', agentsRes.error.message)
    return NextResponse.json({ error: 'Klienterna kunde inte hämtas.' }, { status: 500 })
  }

  const agents = (agentsRes.data ?? []) as {
    id: string; name: string; business_name: string | null; monthly_price_sek?: number | null
  }[]
  if (agents.length === 0) {
    return NextResponse.json({ clients: [], rate: usdToSekRate(), period, note: syncNote })
  }

  const agentIds = agents.map(a => a.id)
  const since = periodStart(period)

  // ── Samtal och nummer ─────────────────────────────────────────────────────
  const COST_COLS = 'agent_id, duration_sec, cost_twilio_usd, cost_elevenlabs_usd, anthropic_input_tokens, anthropic_output_tokens'
  let callsQuery = supabase
    .from('call_logs')
    .select(COST_COLS)
    .in('agent_id', agentIds)
    .eq('status', 'completed')
  if (since) callsQuery = callsQuery.gte('created_at', since)

  let callsRes = await callsQuery
  let costsSupported = true
  if (callsRes.error && isMissingColumn(callsRes.error)) {
    costsSupported = false
    let base = supabase.from('call_logs').select('agent_id, duration_sec').in('agent_id', agentIds).eq('status', 'completed')
    if (since) base = base.gte('created_at', since)
    callsRes = (await base) as typeof callsRes
  }
  if (callsRes.error) {
    console.error('[client-costs] Kunde inte läsa samtal:', callsRes.error.message)
    return NextResponse.json({ error: 'Samtalen kunde inte hämtas.' }, { status: 500 })
  }

  const { data: phones } = await supabase.from('phone_numbers').select('agent_id, phone_number').in('agent_id', agentIds)

  type CallRow = CallCostRow & { agent_id: string; duration_sec: number | null }
  const calls = (callsRes.data ?? []) as unknown as CallRow[]
  const rate = usdToSekRate()

  const clients: ClientCostRow[] = agents.map(agent => {
    const own = calls.filter(c => c.agent_id === agent.id)
    const totals = sumCosts(own)
    const sek = (usd: number) => Math.round(usd * rate * 100) / 100
    const totalSek = sek(totals.totalUsd)
    const price = priceSupported ? (agent.monthly_price_sek ?? null) : null

    return {
      agentId: agent.id,
      name: agent.business_name || agent.name,
      phoneNumbers: (phones ?? []).filter(p => p.agent_id === agent.id).map(p => p.phone_number as string),
      calls: own.length,
      minutes: Math.round(own.reduce((sum, c) => sum + (c.duration_sec ?? 0), 0) / 60),
      costs: {
        twilioSek: sek(totals.twilioUsd),
        elevenLabsSek: sek(totals.elevenLabsUsd),
        anthropicSek: sek(totals.anthropicUsd),
        totalSek,
      },
      monthlyPriceSek: price != null ? Number(price) : null,
      marginSek: price != null ? Math.round((Number(price) - totalSek) * 100) / 100 : null,
      estimatedCalls: totals.estimatedCalls,
      missingTwilio: totals.missingTwilio,
      missingElevenLabs: totals.missingElevenLabs,
    }
  })

  return NextResponse.json({
    clients,
    rate,
    period,
    priceSupported,
    costsSupported,
    note: syncNote,
  })
}
