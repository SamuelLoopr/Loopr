import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

export async function POST(req: NextRequest) {
  const { agentId } = await req.json()
  if (!agentId) return NextResponse.json({ error: 'agentId krävs' }, { status: 400 })

  const token = randomBytes(16).toString('hex')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { error } = await supabase.from('agents').update({ webhook_token: token }).eq('id', agentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const base = process.env.APP_BASE_URL || new URL(req.url).origin
  return NextResponse.json({ token, url: `${base.replace(/\/$/, '')}/api/webhooks/${token}` })
}
