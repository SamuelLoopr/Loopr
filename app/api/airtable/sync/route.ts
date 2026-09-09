import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const apiKey = process.env.AIRTABLE_API_KEY
  const baseId = process.env.AIRTABLE_BASE_ID
  if (!apiKey || !baseId) {
    return NextResponse.json(
      { error: 'AIRTABLE_API_KEY / AIRTABLE_BASE_ID saknas i servermiljön (.env.local).' },
      { status: 500 }
    )
  }

  const { agentId } = await req.json()
  if (!agentId) return NextResponse.json({ error: 'agentId krävs' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: agent, error: agentErr } = await supabase
    .from('agents')
    .select('airtable_table_name')
    .eq('id', agentId)
    .single()

  if (agentErr || !agent) return NextResponse.json({ error: 'Agent hittades inte' }, { status: 404 })
  if (!agent.airtable_table_name) {
    return NextResponse.json({ error: 'Inget Airtable-tabellnamn satt för den här agenten (Samtal-fliken).' }, { status: 400 })
  }

  const { data: calls, error: callsErr } = await supabase
    .from('call_logs')
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (callsErr) return NextResponse.json({ error: callsErr.message }, { status: 500 })
  if (!calls || calls.length === 0) return NextResponse.json({ synced: 0 })

  const records = calls.map(c => ({
    fields: {
      'Call ID': c.id,
      'From': c.from_number ?? '',
      'To': c.to_number ?? '',
      'Duration (sec)': c.duration_sec ?? 0,
      'Status': c.status ?? 'completed',
      'Summary': c.summary ?? '',
      'Transcript': c.transcript ?? '',
      'Created': c.created_at,
    },
  }))

  // Airtable accepts max 10 records per request
  const chunks: (typeof records)[] = []
  for (let i = 0; i < records.length; i += 10) chunks.push(records.slice(i, i + 10))

  let synced = 0
  for (const chunk of chunks) {
    const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(agent.airtable_table_name)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: chunk, typecast: true }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: err.error?.message || `Airtable-fel (${res.status})`, synced }, { status: res.status })
    }
    const data = await res.json()
    synced += (data.records || []).length
  }

  return NextResponse.json({ synced })
}
