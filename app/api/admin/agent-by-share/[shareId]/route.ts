import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isAllowedEmail } from '@/lib/admin'

// Resolves a public share id to the agent's internal id, for the "edit this
// agent" shortcut on the public master-demo page.
//
// WHY THIS IS A SEPARATE ROUTE
// The public payload from /api/public-agent/[shareId]/master deliberately never
// includes the agent's UUID — a prospect holding a demo link must not learn it.
// Putting the lookup here keeps that true: the id is only ever returned to a
// request that carries an admin session, and an anonymous caller gets 401 with
// no hint that the share id even exists.
//
// TWO INDEPENDENT CHECKS, ON PURPOSE
// middleware.ts already gates the /api/admin prefix and enforces the same
// allow-list. This handler repeats both checks rather than trusting that gate,
// so a future change to the middleware matcher cannot silently expose the id.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params

  const supabase = await createSupabaseServerClient()

  // getUser(), not getSession(): revalidates the JWT against Supabase Auth
  // rather than trusting the cookie's claims.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Inloggning krävs.' }, { status: 401 })
  }
  if (!isAllowedEmail(user.email)) {
    return NextResponse.json({ error: 'Kontot saknar behörighet.' }, { status: 403 })
  }

  // Runs as the signed-in user, so the authenticated-only RLS policy on
  // `agents` applies here too — a third layer behind the two checks above.
  const { data, error } = await supabase
    .from('agents')
    .select('id, name')
    .eq('public_share_id', shareId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'Uppslagningen misslyckades.' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Ingen agent matchar den här demolänken.' }, { status: 404 })
  }

  return NextResponse.json({ agentId: data.id, agentName: data.name })
}
