import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingColumn, isMissingTable } from '@/lib/db-errors'
import { mentionsHealth } from '@/lib/call-insights'
import { normalizeE164 } from '@/lib/phone'
import { buildSmsReplyNotification } from '@/lib/sms-reply-notification'
import { isEmailConfigured, sendEmail } from '@/lib/email'

// Ett sms som kommit in till en agents nummer (46elks sms_url ->
// app/api/46elks/[token]/incoming-sms). Sparas på avsändarens senaste samtal
// till samma agent och mejlas till agentens notisadress.
//
// 46elks försöker igen i minst sex timmar om vi inte svarar 2xx. Därför är
// elks_id unikt i call_sms_replies (043): ett omlevererat sms ger en
// konfliktrad och ingenting mer, och mejlet "bokas" med notified_at på samma
// sätt som samtalsnotisen.

/** Hur långt bakåt ett samtal letas för att koppla svaret till. */
const MATCH_DAYS = 30
const MESSAGE_MAX = 2000

export interface IncomingSms {
  id: string
  from: string
  to: string
  message: string
}

export type SmsReplyOutcome =
  | { outcome: 'saved'; replyId: string; agentId: string }
  | { outcome: 'duplicate' | 'unknown_number' | 'malformed' | 'not_enabled' }
  | { outcome: 'db_error' }

/** Fälten 46elks skickar, eller null om något väsentligt saknas. */
export function parseIncomingSms(fields: Record<string, string>): IncomingSms | null {
  const id = fields.id?.trim()
  const from = fields.from?.trim()
  const to = fields.to?.trim()
  const message = fields.message ?? ''
  if (!id || !/^[A-Za-z0-9]{8,64}$/.test(id) || !from || !to) return null
  if (fields.direction && fields.direction !== 'incoming') return null
  return { id, from, to, message: message.slice(0, MESSAGE_MAX) }
}

export async function saveIncomingSms(supabase: SupabaseClient, sms: IncomingSms): Promise<SmsReplyOutcome> {
  const to = normalizeE164(sms.to)
  const from = normalizeE164(sms.from)
  if (!to.ok || !from.ok) return { outcome: 'malformed' }

  const { data: number, error: numberError } = await supabase
    .from('phone_numbers')
    .select('agent_id')
    .eq('phone_number', to.e164)
    .maybeSingle()
  if (numberError) return { outcome: 'db_error' }
  if (!number?.agent_id) return { outcome: 'unknown_number' }
  const agentId = number.agent_id as string

  // Bara agenter som skickar sms tar emot svar; för alla andra sparas inget.
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('sms_enabled')
    .eq('id', agentId)
    .maybeSingle()
  if (agentError) return isMissingColumn(agentError) ? { outcome: 'not_enabled' } : { outcome: 'db_error' }
  if (agent?.sms_enabled !== true) return { outcome: 'not_enabled' }

  // Senaste samtalet från numret, eller där numret gavs som återuppringnings-
  // nummer. from.e164 är kontrollerat (+ och siffror) innan det hamnar i
  // filtret nedan, så det kan inte bära egna PostgREST-operatorer.
  const since = new Date(Date.now() - MATCH_DAYS * 86_400_000).toISOString()
  const { data: calls, error: callError } = await supabase
    .from('call_logs')
    .select('id')
    .eq('agent_id', agentId)
    .gte('created_at', since)
    .or(`from_number.eq.${from.e164},callback_number.eq.${from.e164}`)
    .order('created_at', { ascending: false })
    .limit(1)
  if (callError) console.error(`[sms-reply] Kunde inte leta samtal: ${callError.message}`)
  const callLogId = (calls?.[0]?.id as string | undefined) ?? null

  const { data: inserted, error: insertError } = await supabase
    .from('call_sms_replies')
    .insert({ agent_id: agentId, call_log_id: callLogId, elks_id: sms.id, from_number: from.e164, message: sms.message })
    .select('id')
    .single()
  if (insertError) {
    if (insertError.code === '23505') return { outcome: 'duplicate' }
    if (isMissingTable(insertError)) return { outcome: 'not_enabled' }
    console.error(`[sms-reply] Kunde inte spara svaret: ${insertError.message}`)
    return { outcome: 'db_error' }
  }

  return { outcome: 'saved', replyId: inserted.id as string, agentId }
}

/**
 * Mejlar ett sparat svar till agentens notisadress, en gång. Bara i
 * klientläge, som samtalsnotisen. Misslyckas utskicket släpps bokningen.
 */
export async function notifySmsReply(supabase: SupabaseClient, agentId: string, replyId: string): Promise<void> {
  const { data: agent } = await supabase
    .from('agents')
    .select('name, business_name, public_share_id, client_mode, notification_email')
    .eq('id', agentId)
    .maybeSingle()
  if (!agent?.client_mode || !agent.notification_email || !agent.public_share_id) return

  const configured = isEmailConfigured()
  if (!configured.ok) {
    console.warn(`[sms-reply] Hoppar över mejl — ${configured.reason}`)
    return
  }
  const base = process.env.APP_BASE_URL?.trim().replace(/\/$/, '')
  if (!base) {
    console.error('[sms-reply] APP_BASE_URL saknas — hoppar över mejl')
    return
  }

  const { data: reply, error } = await supabase
    .from('call_sms_replies')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', replyId)
    .eq('agent_id', agentId)
    .is('notified_at', null)
    .select('call_log_id, from_number, message, received_at')
    .maybeSingle()
  if (error || !reply) return

  let callerName: string | null = null
  let callStartedAt: string | null = null
  let publicRef: string | null = null
  if (reply.call_log_id) {
    const { data: call } = await supabase
      .from('call_logs')
      .select('caller_name, created_at, public_ref')
      .eq('id', reply.call_log_id)
      .eq('agent_id', agentId)
      .maybeSingle()
    callerName = (call?.caller_name as string | null) ?? null
    callStartedAt = (call?.created_at as string | null) ?? null
    publicRef = (call?.public_ref as string | null) ?? null
  }

  const anchor = publicRef ? `#samtal-${publicRef}` : ''
  const built = buildSmsReplyNotification({
    businessName: (agent.business_name as string | null) || (agent.name as string),
    fromNumber: reply.from_number as string,
    callerName,
    message: reply.message as string,
    hideMessage: mentionsHealth(reply.message as string),
    receivedAt: reply.received_at as string,
    callStartedAt,
    url: `${base}/master/${encodeURIComponent(agent.public_share_id as string)}${anchor}`,
  })

  const result = await sendEmail({ to: agent.notification_email as string, ...built })
  if (result.status === 'sent') {
    console.log(`[sms-reply] Mejl skickat för svar ${replyId} (${result.id})`)
    return
  }
  const reason = result.status === 'failed' ? result.error : result.reason
  console.error(`[sms-reply] Mejl misslyckades för svar ${replyId}: ${reason}`)
  await supabase.from('call_sms_replies').update({ notified_at: null }).eq('id', replyId)
}
