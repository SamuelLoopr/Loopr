import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { NO_STORE, validShareId } from '@/lib/public-share'

// /forslag/[shareId]: ett förslag och avsändarens profil. Statusen flyttas
// från "sent" till "viewed" här på servern i stället för från webbläsaren.
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  const shareId = validShareId((await params).shareId)
  if (!shareId) return NextResponse.json({ error: 'Hittades inte' }, { status: 404, headers: NO_STORE })

  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('proposals')
    .select('id, title, tagline, avg_job_value, status, created_at')
    .eq('share_id', shareId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Kunde inte hämtas' }, { status: 500, headers: NO_STORE })
  if (!data) return NextResponse.json({ error: 'Hittades inte' }, { status: 404, headers: NO_STORE })

  if (data.status === 'sent') {
    const { error: viewError } = await supabase.from('proposals').update({ status: 'viewed' }).eq('id', data.id).eq('status', 'sent')
    if (viewError) console.error(`[public/proposal] Kunde inte markera som visat: ${viewError.message}`)
  }

  // Avsändaren: operatörens profil, samma rad som sidan läste förut.
  const { data: profile } = await supabase
    .from('profile')
    .select('display_name, business_name, tagline, bio, phone, avatar_url')
    .limit(1)
    .maybeSingle()

  const { id: _id, status: _status, ...proposal } = data
  return NextResponse.json({ proposal, profile: profile ?? null }, { headers: NO_STORE })
}
