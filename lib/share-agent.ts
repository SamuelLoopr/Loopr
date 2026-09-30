import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingColumn } from '@/lib/db-errors'

// Share id -> the one agent behind it, for every public route under
// /api/public-agent/[shareId]. Server-only: it runs on the service role, and the
// id it returns is for scoping queries — never for a response body.
//
// One lookup for all of them, so "which agent does this link open, is it in
// client mode, which sections are on" cannot be answered differently by
// different routes. Steps down through older schemas because the code ships
// ahead of its migrations: client_mode is 029, master_sections is 017.

export interface ShareAgent {
  id: string
  leadId: string | null
  name: string
  businessName: string | null
  industry: string | null
  description: string | null
  services: string | null
  status: string | null
  /** master_sections as stored. null = every section on. */
  sections: Record<string, boolean> | null
  /** 029: the link is a paying client's page, not a sales demo. */
  clientMode: boolean
  /** 030: where per-call notifications go. Null = off. */
  notificationEmail: string | null
}

const BASE = 'id, lead_id, name, business_name, industry, description, services, status'
const TIERS = [
  `${BASE}, master_sections, client_mode, notification_email`, // 030
  `${BASE}, master_sections, client_mode`,                     // 029
  `${BASE}, master_sections`,                                  // 017
  BASE,
]

interface AgentRow {
  id: string
  lead_id: string | null
  name: string
  business_name: string | null
  industry: string | null
  description: string | null
  services: string | null
  status: string | null
  master_sections?: Record<string, boolean> | null
  client_mode?: boolean | null
  notification_email?: string | null
}

export async function resolveShareAgent(supabase: SupabaseClient, shareId: string): Promise<ShareAgent | null> {
  for (const cols of TIERS) {
    const { data, error } = await supabase
      .from('agents')
      .select(cols)
      .eq('public_share_id', shareId)
      .maybeSingle()

    if (error) {
      if (isMissingColumn(error)) continue
      console.error('[share-agent] Uppslagning misslyckades:', error.message)
      return null
    }
    if (!data) return null

    const row = data as unknown as AgentRow
    return {
      id: row.id,
      leadId: row.lead_id,
      name: row.name,
      businessName: row.business_name,
      industry: row.industry,
      description: row.description,
      services: row.services,
      status: row.status,
      sections: row.master_sections ?? null,
      clientMode: row.client_mode === true,
      notificationEmail: row.notification_email ?? null,
    }
  }
  return null
}

/** A missing key or a NULL master_sections means on. */
export function sectionOn(agent: ShareAgent, key: string): boolean {
  return agent.sections?.[key] !== false
}
