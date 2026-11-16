import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OfferedSlot } from '@/lib/cal-com'

// Det gemensamma för säljlinjens tre verktyg hos ElevenLabs
// (app/api/webhooks/elevenlabs/sales/[token]/…): skyddet, bodyn, och raden i
// sales_calls som verktygen skriver i under samtalet.
//
// SKYDD: exakt som lagg_pa (app/api/webhooks/elevenlabs/hangup): token i
// vägen (ELEVENLABS_INIT_TOKEN) och den hemliga headern x-loopr-init-secret
// (ELEVENLABS_INIT_SECRET). Fel på något av dem ger 404.
//
// SVAR: ElevenLabs ger texten i `result` till modellen som verktygets svar.
// Den ska därför vara något agenten kan säga rakt av, på svenska, och aldrig
// innehålla något den inte får säga. Verktygets tidsgräns hos ElevenLabs är
// 10 s; routerna håller sig under 8.
//
// Verktygen svarar alltid 200 med en text: ett 500 hade gett modellen ett
// engelskt felmeddelande att läsa upp.

const SECRET_HEADER = 'x-loopr-init-secret'
export const ROUTE_BUDGET_MS = 8_000

const CONVERSATION_ID = /^conv_[A-Za-z0-9]+$/

function equals(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)
}

export function toolAuthorised(req: NextRequest, token: string): boolean {
  const expectedToken = process.env.ELEVENLABS_INIT_TOKEN?.trim()
  const expectedSecret = process.env.ELEVENLABS_INIT_SECRET?.trim()
  const got = req.headers.get(SECRET_HEADER)?.trim()
  const previous = process.env.ELEVENLABS_INIT_SECRET_PREVIOUS?.trim()
  const secretOk = Boolean(got) && Boolean(expectedSecret)
    && (equals(expectedSecret!, got!) || (Boolean(previous) && equals(previous!, got!)))
  return Boolean(expectedToken && token && equals(expectedToken, token) && secretOk)
}

export const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

/** Verktygets svar till modellen. */
export const reply = (result: string) => NextResponse.json({ result })

export interface ToolBody {
  conversationId: string | null
  calledNumber: string | null
  fields: Record<string, unknown>
}

export async function toolBody(req: NextRequest): Promise<ToolBody> {
  let fields: Record<string, unknown> = {}
  try {
    fields = (await req.json()) as Record<string, unknown>
  } catch {
    fields = {}
  }
  const str = (k: string) => (typeof fields[k] === 'string' ? (fields[k] as string).trim() : '')
  const conversationId = str('conversation_id')
  return {
    conversationId: CONVERSATION_ID.test(conversationId) ? conversationId : null,
    calledNumber: str('called_number') || null,
    fields,
  }
}

export interface SalesCallRow {
  id: string
  agent_id: string
  conversation_id: string
  offered_slots: OfferedSlot[] | null
  booking_uid: string | null
  email: string | null
  info_sent_at: string | null
  caller_name: string | null
  company: string | null
}

export interface SalesAgent {
  id: string
  cal_com_event_type_id: string | null
}

/**
 * Raden i sales_calls för konversationen, skapad om den inte finns. Numret
 * som ringdes pekar ut agenten (phone_numbers, som conversation-init), och
 * bara en agent med kind = 'sales' får en rad — ett verktyg som av misstag
 * sitter på en annan agent gör ingenting.
 */
export async function salesCallFor(
  supabase: SupabaseClient,
  conversationId: string,
  calledNumber: string | null,
): Promise<{ row: SalesCallRow; agent: SalesAgent } | null> {
  const COLS = 'id, agent_id, conversation_id, offered_slots, booking_uid, email, info_sent_at, caller_name, company'
  const existing = await supabase.from('sales_calls').select(COLS).eq('conversation_id', conversationId).maybeSingle()
  let row = (existing.data as SalesCallRow | null) ?? null

  let agentId = row?.agent_id ?? null
  if (!agentId) {
    if (!calledNumber) return null
    const { data: number } = await supabase.from('phone_numbers').select('agent_id').eq('phone_number', calledNumber).maybeSingle()
    agentId = (number?.agent_id as string | undefined) ?? null
    if (!agentId) return null
  }

  const { data: agent, error } = await supabase
    .from('agents').select('id, kind, cal_com_event_type_id').eq('id', agentId).maybeSingle()
  if (error || !agent || agent.kind !== 'sales') return null

  if (!row) {
    // Omleverans eller två verktyg samtidigt: unikt index på conversation_id,
    // så den andra insättningen avvisas (23505) och raden läses i stället.
    const { error: insertError } = await supabase.from('sales_calls').insert({
      agent_id: agentId, conversation_id: conversationId, call_log_id: await callLogIdFor(supabase, conversationId),
    })
    if (insertError && insertError.code !== '23505') {
      console.error(`[sales-tools] Kunde inte skapa sales_calls-raden: ${insertError.message}`)
      return null
    }
    const again = await supabase.from('sales_calls').select(COLS).eq('conversation_id', conversationId).maybeSingle()
    row = (again.data as SalesCallRow | null) ?? null
    if (!row) return null
  }

  return { row, agent: { id: agent.id as string, cal_com_event_type_id: (agent.cal_com_event_type_id as string | null) ?? null } }
}

/** call_logs-raden för konversationen, som lib/call-ingest.ts hittar den. */
export async function callLogIdFor(supabase: SupabaseClient, conversationId: string): Promise<string | null> {
  if (!CONVERSATION_ID.test(conversationId)) return null
  const { data } = await supabase
    .from('call_logs').select('id').like('error_message', `%conversation_id=${conversationId}%`).limit(1)
  return (data?.[0]?.id as string | undefined) ?? null
}

/** Förnamnet ur ett namn som sades i samtalet, för tilltal i mejl. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0]
  return first && /^[\p{L}'-]{2,30}$/u.test(first) ? first : null
}
