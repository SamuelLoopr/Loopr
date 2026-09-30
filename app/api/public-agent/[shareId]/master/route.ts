import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { resolveShareAgent, sectionOn } from '@/lib/share-agent'

// Backs the public page (app/master/[shareId]), which has two modes:
//
//   demo    — the Master Demo for a prospect. Resolves the agent, then fans out
//             to every artefact linked to it (audit, review-automation client,
//             proposal — migrations 014/015) and merges them into one payload.
//   client  — the BOS page of a paying client (agents.client_mode, 029). Only
//             what a client uses: their company, their account, and whether the
//             calls section is on. No sales content is fetched or sent, so none
//             can appear on the page even by mistake. Calls and bookings load
//             from their own routes.
//
// Same rule as the /prova route in both modes: a visitor only ever receives
// display fields chosen here. prompt_text, transfer_number, voice_id,
// webhook_token, the agent and lead UUIDs, and the lead's phone/email never
// cross this boundary. The live-call credentials stay in the POST handler of the
// parent route.

interface AuditContent {
  summary?: string
  visibility_score?: number
  missed_calls_pct?: number
  google_rating?: string
  improvements?: string[]
}

const DAY_MS = 86_400_000

export async function GET(_req: NextRequest, { params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params
  // Runs for callers with no session, so it uses the service client — see
  // lib/supabase-server.ts.
  const supabase = createSupabaseServiceClient()

  const agent = await resolveShareAgent(supabase, shareId)
  if (!agent) {
    return NextResponse.json({ error: 'Länken hittades inte' }, { status: 404 })
  }

  // ── Client mode ─────────────────────────────────────────────────────────
  if (agent.clientMode) {
    const [phonesRes, recentRes] = await Promise.all([
      supabase.from('phone_numbers').select('phone_number').eq('agent_id', agent.id),
      supabase
        .from('call_logs')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', agent.id)
        .eq('status', 'completed')
        .gte('created_at', new Date(Date.now() - 30 * DAY_MS).toISOString()),
    ])

    return NextResponse.json({
      mode: 'client',
      business: { agentName: agent.name, businessName: agent.businessName },
      calls: sectionOn(agent, 'calls'),
      account: {
        receptionistActive: agent.status === 'deployed',
        // The number the business's customers call — the client's own public
        // number, not a caller's.
        phoneNumbers: (phonesRes.data ?? []).map(p => p.phone_number as string).filter(Boolean),
        callsLast30Days: recentRes.count ?? 0,
        // The client's own address for call notifications (030). It is their
        // own setting, shown back to them so they can change it.
        notificationEmail: agent.notificationEmail,
      },
    })
  }

  // ── Demo mode ───────────────────────────────────────────────────────────
  // Null/missing sections mean "show everything there is data for" — so links
  // created before the builder existed keep rendering exactly as they did.
  const enabled = (key: string) => sectionOn(agent, key)

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
    mode: 'demo',
    business: {
      agentName: agent.name,
      businessName: agent.businessName,
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
