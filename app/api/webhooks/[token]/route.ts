import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Generic receiver for the per-agent webhook generated on the Calls tab.
// Any system (Zapier, a custom integration, a test curl) can POST call data
// here and it lands in call_logs for that agent.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: agent, error: lookupErr } = await supabase
    .from('agents')
    .select('id')
    .eq('webhook_token', token)
    .single()

  if (lookupErr || !agent) {
    return NextResponse.json({ error: 'Okänd eller borttagen webhook' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))

  const { error: insertErr } = await supabase.from('call_logs').insert({
    agent_id: agent.id,
    transcript: typeof body.transcript === 'string' ? body.transcript : null,
    summary: typeof body.summary === 'string' ? body.summary : null,
    sentiment: typeof body.sentiment === 'string' ? body.sentiment : null,
    duration_sec: typeof body.duration_sec === 'number' ? body.duration_sec : null,
    cost: typeof body.cost === 'number' ? body.cost : null,
    from_number: typeof body.from_number === 'string' ? body.from_number : null,
    to_number: typeof body.to_number === 'string' ? body.to_number : null,
    status: body.error ? 'error' : 'completed',
    error_message: typeof body.error === 'string' ? body.error : null,
  })

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
