import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'

// Backs the public Master Demo one-pager (app/master/[shareId]).
//
// It resolves the agent from the same public_share_id the voice demo uses, then
// fans out to every artefact linked to that agent — audit, review-automation
// client and proposal (linked via migrations 014/015) — and merges them into a
// single payload.
//
// Same rule as the /prova route: a prospect only ever receives display fields we
// choose here. prompt_text, transfer_number, voice_id, webhook_token, the agent
// and lead UUIDs, and the lead's phone/email never cross this boundary. The
// live-call credentials stay in the POST handler of the parent route.

// Runs for callers with no session, so it uses the service client:
// SUPABASE_SERVICE_ROLE_KEY when configured, otherwise the anon key it has
// always used. See lib/supabase-server.ts.
function supabaseClient() {
  return createSupabaseServiceClient()
}

interface AuditContent {
  summary?: string
  visibility_score?: number
  missed_calls_pct?: number
  google_rating?: string
  improvements?: string[]
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  const supabase = supabaseClient()

  const BASE_COLS = 'id, lead_id, name, business_name, industry, description, services, status'

  // master_sections arrives with migration 017; fall back to the base columns so
  // the page keeps working on a database that hasn't run it yet.
  let { data: agent, error } = await supabase
    .from('agents')
    .select(`${BASE_COLS}, master_sections`)
    .eq('public_share_id', shareId)
    .single()

  if (error && error.message.includes('master_sections')) {
    ({ data: agent, error } = await supabase
      .from('agents')
      .select(BASE_COLS)
      .eq('public_share_id', shareId)
      .single())
  }

  if (error || !agent) {
    return NextResponse.json({ error: 'Demon hittades inte' }, { status: 404 })
  }

  // Null/missing means "show everything there is data for" — so links created
  // before the builder existed keep rendering exactly as they did.
  const sections = (agent as { master_sections?: Record<string, boolean> | null }).master_sections ?? null
  const enabled = (key: string) => sections?.[key] !== false

  // Each section is optional — the page hides whatever comes back null rather
  // than rendering an empty shell, so a half-prepared prospect page still looks
  // deliberate.
  const [auditRes, reviewRes, proposalRes] = await Promise.all([
    supabase
      .from('audits')
      .select('share_id, business_name, website_url, content, created_at')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('review_clients')
      .select('share_id, business_name, google_review_url, delay_minutes, message_template')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('proposals')
      .select('share_id, title, tagline, avg_job_value')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const auditRow = enabled('audit') ? auditRes.data : null
  const content: AuditContent = (auditRow?.content as AuditContent) ?? {}

  return NextResponse.json({
    business: {
      agentName: agent.name,
      businessName: agent.business_name,
      industry: agent.industry,
      description: agent.description,
      services: agent.services,
      status: agent.status,
    },

    // No table behind these two — the page reads the flags directly.
    voice: enabled('voice'),
    benefits: enabled('benefits'),

    // Highlights only — the full report stays behind its own /audit link.
    audit: auditRow
      ? {
          shareId: auditRow.share_id,
          websiteUrl: auditRow.website_url,
          visibilityScore: content.visibility_score ?? 50,
          summary: content.summary ?? null,
          googleRating: content.google_rating ?? null,
          missedCallsPct: content.missed_calls_pct ?? 27,
          improvements: (content.improvements ?? []).slice(0, 3),
          createdAt: auditRow.created_at,
        }
      : null,

    sms: enabled('sms') && reviewRes.data
      ? {
          shareId: reviewRes.data.share_id,
          business_name: reviewRes.data.business_name,
          google_review_url: reviewRes.data.google_review_url,
          delay_minutes: reviewRes.data.delay_minutes,
          message_template: reviewRes.data.message_template,
        }
      : null,

    proposal: enabled('proposal') && proposalRes.data
      ? {
          shareId: proposalRes.data.share_id,
          title: proposalRes.data.title,
          tagline: proposalRes.data.tagline,
          avgJobValue: proposalRes.data.avg_job_value,
        }
      : null,
  })
}
