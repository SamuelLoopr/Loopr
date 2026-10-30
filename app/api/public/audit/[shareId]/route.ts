import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { NO_STORE, validShareId } from '@/lib/public-share'

// /audit/[shareId]: en audit-rapport, bara fälten sidan visar.
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  const shareId = validShareId((await params).shareId)
  if (!shareId) return NextResponse.json({ error: 'Hittades inte' }, { status: 404, headers: NO_STORE })

  const { data, error } = await createSupabaseServiceClient()
    .from('audits')
    .select('business_name, website_url, share_id, status, content, created_at')
    .eq('share_id', shareId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Kunde inte hämtas' }, { status: 500, headers: NO_STORE })
  if (!data) return NextResponse.json({ error: 'Hittades inte' }, { status: 404, headers: NO_STORE })
  return NextResponse.json({ audit: data }, { headers: NO_STORE })
}
