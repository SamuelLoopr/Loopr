import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { randomBytes } from 'crypto'

export async function POST(req: NextRequest) {
  const { agentId } = await req.json()
  if (!agentId) return NextResponse.json({ error: 'agentId krävs' }, { status: 400 })

  const token = randomBytes(16).toString('hex')

  // Acts as the signed-in user rather than as anon: middleware.ts already
  // guarantees a session on this route, and the authenticated-only RLS policies
  // in 019_auth_rls.sql would reject these reads and writes from the anon role.
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from('agents').update({ webhook_token: token }).eq('id', agentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const base = process.env.APP_BASE_URL || new URL(req.url).origin
  return NextResponse.json({ token, url: `${base.replace(/\/$/, '')}/api/webhooks/${token}` })
}
