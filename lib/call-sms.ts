import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingColumn } from '@/lib/db-errors'
import { mentionsHealth } from '@/lib/call-insights'
import { CALLBACK_PLACEHOLDER, promisedCallback } from '@/lib/callback-time'
import { callbackSmsText, firstName, mentionsPrice, smsRecipient, smsStillTimely } from '@/lib/callback-sms'
import { parseTranscript } from '@/lib/call-transcript'
import { scrubNumbers, sendSms, type SmsResult } from '@/lib/sms'

// Skickar sms-bekräftelsen för ett färdiganalyserat samtal — anropas från
// lib/call-sync.ts direkt efter att analysen sparats, bredvid notismejlet.
//
// Villkoren, alla måste stämma:
//   - agenten har sms_enabled och en avsändare (043)
//   - agentens prompt lovar en tid ({{ATERUPPRINGNING}}) och receptionisten sa
//     den i samtalet — samma kontroll som "Utlovad återuppringning" i BOS
//   - det finns ett svenskt mobilnummer att skicka till (lib/callback-sms.ts)
//   - samtalet är färskt och återuppringningsdagen har inte börjat
//
// EXAKT ETT SMS PER SAMTAL. Raden låses med ett villkorat UPDATE —
// `where sms_claimed_at is null` — innan något skickas, så två samtidiga
// körningar aldrig skickar två sms. Låset släpps inte vid fel, till skillnad
// från mejlet: ett sms som 46elks tog emot men vars svar tappades skulle
// annars gå ut igen. Hellre ett uteblivet sms än två. Felet sparas i sms_error.
//
// Anroparen fångar allt som kastas härifrån; ett misslyckat sms får aldrig
// stoppa analysen eller mejlet.

interface AgentSms {
  sms_enabled: boolean | null
  sms_sender: string | null
  business_name: string | null
  name: string | null
  prompt_text: string | null
}

interface CallSms {
  created_at: string
  transcript: string | null
  from_number: string | null
  callback_number: string | null
  caller_name: string | null
}

export type CallbackSmsOutcome =
  | 'off' | 'not_promised' | 'no_mobile' | 'too_late' | 'already_claimed'
  | 'sent' | 'blocked' | 'failed' | 'refused_content'

export async function sendCallbackSms(
  supabase: SupabaseClient,
  agentId: string,
  callId: string,
  now: Date = new Date(),
): Promise<CallbackSmsOutcome> {
  const { data: agentData, error: agentError } = await supabase
    .from('agents')
    .select('sms_enabled, sms_sender, business_name, name, prompt_text')
    .eq('id', agentId)
    .maybeSingle()
  // Migration 043 inte körd: sms är helt enkelt inte påslaget.
  if (agentError) {
    if (!isMissingColumn(agentError)) console.error(`[call-sms] Kunde inte läsa agenten: ${agentError.message}`)
    return 'off'
  }
  const agent = agentData as AgentSms | null
  if (!agent?.sms_enabled || !agent.sms_sender) return 'off'
  if (!agent.prompt_text?.includes(CALLBACK_PLACEHOLDER)) return 'not_promised'

  const { data: callData, error: callError } = await supabase
    .from('call_logs')
    .select('created_at, transcript, from_number, callback_number, caller_name')
    .eq('id', callId)
    .eq('agent_id', agentId)
    .maybeSingle()
  if (callError || !callData) {
    if (callError) console.error(`[call-sms] Kunde inte läsa samtalet ${callId}: ${callError.message}`)
    return 'off'
  }
  const call = callData as CallSms

  const slot = promisedCallback(call.created_at, parseTranscript(call.transcript))
  if (!slot) return 'not_promised'
  const to = smsRecipient(call.callback_number, call.from_number)
  if (!to) return 'no_mobile'
  if (!smsStillTimely(call.created_at, slot, now)) return 'too_late'

  // ── Lås raden ─────────────────────────────────────────────────────────────
  const { data: claimed, error: claimError } = await supabase
    .from('call_logs')
    .update({ sms_claimed_at: now.toISOString() })
    .eq('id', callId)
    .eq('agent_id', agentId)
    .is('sms_claimed_at', null)
    .select('id')
    .maybeSingle()
  if (claimError) {
    if (!isMissingColumn(claimError)) console.error(`[call-sms] Kunde inte låsa ${callId}: ${claimError.message}`)
    return 'off'
  }
  if (!claimed) return 'already_claimed'

  const business = agent.business_name?.trim() || agent.name?.trim() || ''
  const message = callbackSmsText(business, firstName(call.caller_name), slot)

  // Mallen innehåller varken hälsa eller priser; det här fångar ett namn som
  // skulle bära något sådant.
  if (mentionsHealth(message) || mentionsPrice(message)) {
    await record(supabase, callId, { sms_error: 'Stoppat: texten innehöll något som inte får stå i ett sms' })
    return 'refused_content'
  }

  // Ett undantag här lämnar låset satt, så det måste också sparas som ett fel
  // — annars syns aldrig varför sms:et uteblev.
  let result: SmsResult
  try {
    result = await sendSms({ from: agent.sms_sender, to, message })
  } catch (err) {
    result = { status: 'failed', error: `Oväntat fel: ${scrubNumbers(err instanceof Error ? err.message : String(err))}` }
  }

  if (result.status === 'sent') {
    await record(supabase, callId, { sms_sent_at: new Date().toISOString(), sms_id: result.id, sms_error: null })
    console.log(`[call-sms] Sms skickat för samtal ${callId} (${result.id}, ${result.parts ?? '?'} del)`)
    return 'sent'
  }

  const reason = result.status === 'failed' ? result.error
    : result.status === 'blocked' ? `Blockerat: ${result.reason}`
    : 'Oväntat svar (dryrun)'
  console.error(`[call-sms] Sms skickades inte för samtal ${callId}: ${reason}`)
  await record(supabase, callId, { sms_error: reason.slice(0, 300) })
  return result.status === 'blocked' ? 'blocked' : 'failed'
}

async function record(supabase: SupabaseClient, callId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('call_logs').update(patch).eq('id', callId)
  if (error) console.error(`[call-sms] Kunde inte spara sms-utfallet för ${callId}: ${error.message}`)
}
