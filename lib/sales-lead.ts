import type { SupabaseClient } from '@supabase/supabase-js'
import { classifySalesCall, type SalesInsight } from '@/lib/sales-insights'
import { callerSpoke, parseTranscript } from '@/lib/call-transcript'
import { isEmailConfigured, sendEmail } from '@/lib/email'
import { sendOpsAlert } from '@/lib/ops-alert'
import { LEAD_STATUS } from '@/lib/lead-status'
import { toStockholm } from '@/lib/stockholm-time'
import { spokenSlot } from '@/lib/cal-com'
import { isMissingColumn } from '@/lib/db-errors'

// Säljlinjens efterarbete: analys -> sales_calls -> lead i CRM:et -> mejl.
//
// Anropas från lib/call-sync.ts enrichRow, efter den vanliga analysen, och
// BARA för agenter med kind = 'sales' (055). Alla andra agenter passerar
// aldrig hit. Körs isolerat: ett fel här fäller aldrig synken.
//
// EXAKT EN GÅNG. Analysen bokas med analysed_at och mejlet med notified_at,
// båda villkorade uppdateringar som bara en körning kan vinna — samma mönster
// som lib/call-notify.ts. Misslyckas mejlet släpps dess bokning så nästa
// sidladdning försöker igen; analysen görs inte om.
//
// Serveronly: service-rollen, ANTHROPIC_API_KEY och RESEND_API_KEY.

const CONVERSATION_ID = /conversation_id=(conv_[A-Za-z0-9]+)/

/** agents.kind (055). Fel eller saknad kolumn ger false, alltså som förut. */
export async function isSalesAgent(supabase: SupabaseClient, agentId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from('agents').select('kind').eq('id', agentId).maybeSingle()
    return !error && (data as { kind?: string } | null)?.kind === 'sales'
  } catch {
    return false
  }
}

interface SalesAgentRow {
  id: string
  name: string
  business_name: string | null
  notification_email: string | null
  public_share_id: string | null
  crm_list_id: string | null
}

interface CallRow {
  id: string
  transcript: string | null
  from_number: string | null
  created_at: string
  public_ref: string | null
  error_message: string | null
}

interface SalesRow {
  id: string
  email: string | null
  booking_uid: string | null
  meeting_at: string | null
  info_sent_at: string | null
  caller_name: string | null
  company: string | null
  industry: string | null
  missed_calls: string | null
  current_handling: string | null
  opening_hours: string | null
  interest: string | null
  wants_callback: boolean | null
  summary: string | null
  lead_id: string | null
}

export async function processSalesCall(supabase: SupabaseClient, agentId: string, callId: string): Promise<void> {
  const { data: agentData, error: agentError } = await supabase
    .from('agents').select('id, name, business_name, notification_email, public_share_id, crm_list_id').eq('id', agentId).maybeSingle()
  if (agentError || !agentData) return
  const agent = agentData as SalesAgentRow

  const { data: callData, error: callError } = await supabase
    .from('call_logs').select('id, transcript, from_number, created_at, public_ref, error_message').eq('id', callId).eq('agent_id', agentId).maybeSingle()
  if (callError || !callData) return
  const call = callData as CallRow
  const conversationId = call.error_message?.match(CONVERSATION_ID)?.[1]
  if (!conversationId) return

  // Raden finns redan om något verktyg anropades under samtalet.
  const { error: insertError } = await supabase.from('sales_calls')
    .insert({ agent_id: agentId, conversation_id: conversationId, call_log_id: callId })
  if (insertError && insertError.code !== '23505') {
    console.error(`[sales-lead] Kunde inte skapa sales_calls-raden: ${insertError.message}`)
    return
  }

  // ── Boka analysen ─────────────────────────────────────────────────────────
  const SALES_COLS = 'id, email, booking_uid, meeting_at, info_sent_at, caller_name, company, industry, missed_calls, current_handling, opening_hours, interest, wants_callback, summary, lead_id'
  const { data: claimed, error: claimError } = await supabase
    .from('sales_calls')
    .update({ analysed_at: new Date().toISOString(), call_log_id: callId, updated_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .is('analysed_at', null)
    .select(SALES_COLS)
    .maybeSingle()
  if (claimError) {
    console.error(`[sales-lead] Kunde inte boka analysen: ${claimError.message}`)
    return
  }
  // Ingen rad: redan analyserad, eller bokad av en parallell körning. Då
  // återstår bara mejlet, om det inte gått ut.
  let row = claimed as SalesRow | null
  if (!row) {
    const { data: existing } = await supabase.from('sales_calls').select(SALES_COLS).eq('conversation_id', conversationId).maybeSingle()
    row = (existing as SalesRow | null) ?? null
    if (!row) return
  } else {
    const turns = parseTranscript(call.transcript)
    const insight = callerSpoke(turns) ? await classifySalesCall(turns) : SILENT
    if (!insight) {
      // Analysen misslyckades: släpp bokningen så nästa sidladdning gör om den.
      await supabase.from('sales_calls').update({ analysed_at: null }).eq('id', row.id)
      return
    }
    const analysed = {
      // Namn och företag som verktygen fick under samtalet väger tyngre än
      // modellens tolkning av transkriptet.
      caller_name: row.caller_name ?? insight.callerName,
      company: row.company ?? insight.company,
      industry: insight.industry,
      missed_calls: insight.missedCalls,
      current_handling: insight.currentHandling,
      opening_hours: insight.openingHours,
      interest: insight.interest,
      wants_callback: insight.wantsCallback,
      summary: insight.summary,
      updated_at: new Date().toISOString(),
    }
    const { error: writeError } = await supabase.from('sales_calls').update(analysed).eq('id', row.id)
    if (writeError) {
      console.error(`[sales-lead] Kunde inte spara analysen: ${writeError.message}`)
      await supabase.from('sales_calls').update({ analysed_at: null }).eq('id', row.id)
      return
    }
    row = { ...row, ...analysed }

    // ── Leadet i CRM:et ───────────────────────────────────────────────────
    if (agent.crm_list_id) {
      const leadId = await upsertLead(supabase, agent.crm_list_id, row, call)
      if (leadId) {
        await supabase.from('sales_calls').update({ lead_id: leadId }).eq('id', row.id)
        row.lead_id = leadId
      }
    } else {
      console.warn('[sales-lead] agents.crm_list_id saknas — inget lead skapat')
    }
  }

  await notifySamuel(supabase, agent, row, call, conversationId)
}

const SILENT: SalesInsight = {
  callerName: null, company: null, industry: null, missedCalls: null, currentHandling: null, openingHours: null,
  interest: 'kall', wantsCallback: false, summary: 'Den som ringde lade på utan att säga något.', usage: null,
}

const INTEREST_LABEL: Record<string, string> = { varm: 'varm', ljummen: 'ljummen', kall: 'kall' }

function whenText(iso: string): string {
  const { date, time } = toStockholm(iso)
  return `${date} ${time}`
}

/** Raden i notes, en per samtal: det CRM-sidan visar utan egna kolumner. */
function noteLine(row: SalesRow, call: CallRow): string {
  const parts = [
    `${whenText(call.created_at)} · Loopr Voice`,
    row.industry ? `Bransch: ${row.industry}` : null,
    row.missed_calls ? `Missar: ${row.missed_calls}` : null,
    row.current_handling ? `Hanteras i dag: ${row.current_handling}` : null,
    row.opening_hours ? `Öppet: ${row.opening_hours}` : null,
    row.interest ? `Intresse: ${INTEREST_LABEL[row.interest] ?? row.interest}` : null,
    row.meeting_at ? `Möte: ${spokenSlot(row.meeting_at)}` : null,
    row.info_sent_at ? 'Prislista skickad' : null,
    row.wants_callback ? 'Vill bli uppringd' : null,
    row.summary,
  ]
  return parts.filter(Boolean).join(' · ')
}

/**
 * Ett lead per företag: finns ett lead i listan med samma nummer uppdateras
 * det och notes får en rad till. Dolt nummer ger alltid ett nytt lead.
 */
async function upsertLead(supabase: SupabaseClient, listId: string, row: SalesRow, call: CallRow): Promise<string | null> {
  const status = row.meeting_at ? LEAD_STATUS.MOTE : LEAD_STATUS.ATT_KONTAKTA
  const extra = {
    industry: row.industry, missed_calls: row.missed_calls, interest: row.interest, meeting_at: row.meeting_at,
  }
  const line = noteLine(row, call)

  interface ExistingLead { id: string; notes: string | null; email: string | null; name: string | null; business: string | null }
  let existing: ExistingLead | null = null
  if (call.from_number) {
    const { data } = await supabase.from('leads').select('id, notes, email, name, business')
      .eq('list_id', listId).eq('phone', call.from_number).order('created_at', { ascending: false }).limit(1)
    existing = (data?.[0] as ExistingLead | undefined) ?? null
  }

  if (existing) {
    const patch = {
      name: existing.name ?? row.caller_name, business: existing.business ?? row.company,
      email: existing.email ?? row.email, status,
      notes: existing.notes ? `${line}\n${existing.notes}` : line,
      ...extra,
    }
    let res = await supabase.from('leads').update(patch).eq('id', existing.id)
    if (res.error && isMissingColumn(res.error)) {
      const { industry: _i, missed_calls: _m, interest: _n, meeting_at: _t, ...without } = patch
      res = await supabase.from('leads').update(without).eq('id', existing.id)
    }
    if (res.error) console.error(`[sales-lead] Kunde inte uppdatera leadet: ${res.error.message}`)
    return res.error ? null : existing.id
  }

  const insert = {
    list_id: listId, name: row.caller_name, business: row.company, phone: call.from_number, email: row.email,
    status, source: 'loopr_voice', channel: 'samtal', notes: line, ...extra,
  }
  let res = await supabase.from('leads').insert(insert).select('id').maybeSingle()
  if (res.error && isMissingColumn(res.error)) {
    const { industry: _i, missed_calls: _m, interest: _n, meeting_at: _t, ...without } = insert
    res = await supabase.from('leads').insert(without).select('id').maybeSingle()
  }
  if (res.error) {
    console.error(`[sales-lead] Kunde inte skapa leadet: ${res.error.message}`)
    return null
  }
  return (res.data?.id as string | undefined) ?? null
}

/** Mejlet till Samuel, exakt en gång per samtal. */
async function notifySamuel(
  supabase: SupabaseClient, agent: SalesAgentRow, row: SalesRow, call: CallRow, conversationId: string,
): Promise<void> {
  if (!agent.notification_email) return
  const configured = isEmailConfigured()
  if (!configured.ok) {
    console.warn(`[sales-lead] Hoppar över mejl — ${configured.reason}`)
    return
  }
  const base = process.env.APP_BASE_URL?.trim().replace(/\/$/, '') ?? ''

  const { data: claimed, error } = await supabase
    .from('sales_calls').update({ notified_at: new Date().toISOString() })
    .eq('conversation_id', conversationId).is('notified_at', null).select('id').maybeSingle()
  if (error || !claimed) return

  const built = buildLeadEmail({ agent, row, call, base })
  const result = await sendEmail({ to: agent.notification_email, ...built })
  if (result.status === 'sent') {
    console.log(`[sales-lead] Lead-mejl skickat för samtal ${call.id} (${result.id})`)
    return
  }
  const reason = result.status === 'failed' ? result.error : result.reason
  console.error(`[sales-lead] Lead-mejlet misslyckades för ${call.id}: ${reason}`)
  await sendOpsAlert(supabase, 'notify_failed', `Lead-mejlet från säljlinjen gick inte ut: ${reason}`.slice(0, 280))
  await supabase.from('sales_calls').update({ notified_at: null }).eq('conversation_id', conversationId)
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function buildLeadEmail(input: {
  agent: SalesAgentRow
  row: SalesRow
  call: CallRow
  base: string
}): { subject: string; text: string; html: string } {
  const { row, call, agent, base } = input
  const who = [row.caller_name, row.company].filter(Boolean).join(', ') || 'Okänd'
  const tail = [row.company ?? row.caller_name ?? 'okänt företag', row.industry].filter(Boolean).join(' · ')

  const subject = row.meeting_at
    ? `Möte bokat ${spokenSlot(row.meeting_at)}: ${tail}`
    : row.interest === 'varm'
      ? `Varmt lead: ${tail}`
      : `Lead: ${tail}`

  const callUrl = agent.public_share_id
    ? `${base}/master/${encodeURIComponent(agent.public_share_id)}${call.public_ref ? `#samtal-${call.public_ref}` : ''}`
    : null

  const lines: [string, string | null][] = [
    ['Namn', row.caller_name],
    ['Företag', row.company],
    ['Bransch', row.industry],
    ['Telefon', call.from_number ?? 'dolt nummer'],
    ['E-post', row.email],
    ['Missade samtal', row.missed_calls],
    ['Hanteras i dag', row.current_handling],
    ['Öppettider', row.opening_hours],
    ['Intresse', row.interest ? INTEREST_LABEL[row.interest] ?? row.interest : null],
    ['Möte', row.meeting_at ? spokenSlot(row.meeting_at) : 'inget bokat'],
    ['Vill bli uppringd', row.wants_callback ? 'ja' : 'nej'],
    ['Prislista skickad', row.info_sent_at ? 'ja' : 'nej'],
    ['Samtalet', whenText(call.created_at)],
  ]
  const shown = lines.filter((l): l is [string, string] => Boolean(l[1]))

  const text = [
    `${who}`,
    '',
    ...shown.map(([k, v]) => `${k}: ${v}`),
    '',
    row.summary ?? 'Ingen sammanfattning.',
    '',
    callUrl ? `Samtalet: ${callUrl}` : null,
    `CRM: ${base}/crm`,
  ].filter(l => l !== null).join('\n')

  const html = `<!doctype html><html lang="sv"><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px">
<p><strong>${esc(who)}</strong></p>
<table style="border-collapse:collapse">${shown.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#6b6b6b">${esc(k)}</td><td style="padding:2px 0">${esc(v)}</td></tr>`).join('')}</table>
<p>${esc(row.summary ?? 'Ingen sammanfattning.')}</p>
<p>${callUrl ? `<a href="${esc(callUrl)}">Samtalet</a> · ` : ''}<a href="${esc(base)}/crm">CRM</a></p>
</body></html>`

  return { subject, text, html }
}
