import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { ELKS_FAILURE_TEXT, verifyElksCallback } from '@/lib/elks-callback'
import { normalizeE164 } from '@/lib/phone'
import { afterConnectAction, loadFallback } from '@/lib/fallback-number'
import { sendOpsAlert } from '@/lib/ops-alert'

// 46elks `next` efter connect mot ElevenLabs — bara för agenter med
// reservnummer (lib/fallback-number.ts). Benet till ElevenLabs är slut och
// den som ringer är kvar: kort ben betyder att ElevenLabs släppte samtalet,
// och då kopplas det till reserven. Annars läggs det på, som det hade gjorts
// utan `next`.
//
// Samma skydd som incoming-call: token i URL:en plus 46elks IP-adresser.
// Reservnumret läses om här och går genom samma loopskydd; det står aldrig i
// URL:en.

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const auth = verifyElksCallback(req, token)
  if (!auth.ok) {
    console.warn(`[46elks/after-connect] Avvisad (${auth.ip ?? 'okänd IP'}): ${ELKS_FAILURE_TEXT[auth.reason]}`)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const fields = Object.fromEntries(new URLSearchParams(await req.text()))
  const started = Number(new URL(req.url).searchParams.get('t'))
  const parsed = normalizeE164(fields.to?.trim() ?? '')
  if (!parsed.ok) return NextResponse.json({ hangup: 'busy' })

  const supabase = createSupabaseServiceClient()
  const { data: known } = await supabase.from('phone_numbers').select('agent_id').eq('phone_number', parsed.e164).maybeSingle()
  const fallback = known?.agent_id ? await loadFallback(supabase, known.agent_id as string, parsed.e164) : null
  const action = afterConnectAction(fallback, started, Date.now())

  const seconds = Math.round((Date.now() - started) / 1000)
  if ('connect' in action) {
    console.log(`[46elks/after-connect] Benet till ElevenLabs varade ${seconds} s — kopplar till reserven (samtal ${fields.callid ?? '?'})`)
    await sendOpsAlert(supabase, 'call_failed', `ElevenLabs släppte ett samtal till …${parsed.e164.slice(-4)} efter ${seconds} s. Det kopplades till reservnumret.`)
  } else {
    console.log(`[46elks/after-connect] Benet varade ${seconds} s — lägger på (samtal ${fields.callid ?? '?'})`)
  }
  return NextResponse.json(action)
}
