import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveShareAgent, type ShareAgent } from '@/lib/share-agent'

// Shared by the two public booking routes (/api/public-agent/[shareId]/bookings
// and …/bookings/[ref]), so both gate and answer in exactly the same way.
// Server-only.

export const BOOKING_HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }

export const reply = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: BOOKING_HEADERS })
export const notFound = (what = 'Kalendern') => reply({ error: `${what} hittades inte.` }, 404)
export const badRequest = (error: string) => reply({ error }, 400)
export const notEnabled = () =>
  reply({ error: 'Kalendern är inte aktiverad för den här sidan ännu.' }, 503)

export const REF_PATTERN = /^[0-9a-f]{32}$/

// A booking and its note fit in far less; this stops an oversized body before
// it is parsed.
export const MAX_BODY_BYTES = 16_384

/**
 * The agent behind a share id — but only when its page is in client mode. The
 * calendar exists only on a client's page, never on a sales demo, so for a demo
 * link (or no link at all) every booking route answers 404 before it touches
 * bos_bookings.
 */
export async function resolveBookingAgent(supabase: SupabaseClient, shareId: string): Promise<ShareAgent | null> {
  const agent = await resolveShareAgent(supabase, shareId)
  return agent?.clientMode ? agent : null
}

/**
 * call_logs.id -> public_ref for the calls some bookings came from, so a
 * response can name the call without its internal id. Scoped to the agent even
 * here: a booking can only point at the agent's own calls anyway, but the query
 * does not rely on that.
 */
export async function callRefsFor(
  supabase: SupabaseClient,
  agentId: string,
  callIds: (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(callIds.filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return new Map()
  const { data } = await supabase
    .from('call_logs')
    .select('id, public_ref')
    .eq('agent_id', agentId)
    .in('id', ids)
  return new Map((data ?? []).filter(r => r.public_ref).map(r => [r.id as string, r.public_ref as string]))
}

/** A CHECK constraint refused the row — the database's backstop behind booking-rules.ts. */
export const isCheckViolation = (error: { code?: string } | null) => error?.code === '23514'
