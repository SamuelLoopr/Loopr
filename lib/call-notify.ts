import type { SupabaseClient } from '@supabase/supabase-js'
import { buildCallNotification } from '@/lib/call-notification'
import { isEmailConfigured, sendEmail } from '@/lib/email'
import { isMissingColumn } from '@/lib/db-errors'
import type { PublicContactRequest } from '@/lib/public-calls'

// Skickar notisen för ett färdiganalyserat samtal — anropas från
// lib/call-sync.ts direkt efter att analysen sparats.
//
// EXAKT EN GÅNG PER SAMTAL. Analysen körs vid sidladdning och samma rad kan
// passera den flera gånger (två flikar samtidigt, eller en höjning av
// INSIGHT_VERSION som analyserar om äldre samtal). Därför "bokas" raden först
// med ett villkorat UPDATE — `where notified_at is null` — som bara en av
// körningarna kan vinna. Först därefter skickas mejlet. Misslyckas utskicket
// släpps bokningen, så nästa sidladdning försöker igen.
//
// Serveronly: kör på service-rollen via anroparen, och läser RESEND_API_KEY.

/** Samtal äldre än så här notiseras inte. Se kommentaren vid claim nedan. */
const MAX_AGE_DAYS = 7

export interface NotifyAgent {
  id: string
  shareId: string
  businessName: string
  /** Adressen klienten själv ställt in. Null = notiser av. */
  notificationEmail: string | null
}

interface ClaimedRow {
  public_ref: string | null
  caller_name: string | null
  from_number: string | null
  summary: string | null
  contact_request: string | null
  contact_note: string | null
  created_at: string
}

const REQUESTS: readonly PublicContactRequest[] = ['meeting', 'quote', 'callback']

/**
 * Absolut länk till samtalet i BOS: sidans adress plus ankaret som
 * CallList sätter på varje kort (id="samtal-<public_ref>").
 */
function callUrl(base: string, shareId: string, publicRef: string | null): string {
  const anchor = publicRef ? `#samtal-${publicRef}` : ''
  return `${base}/master/${encodeURIComponent(shareId)}${anchor}`
}

export async function notifyCompletedCall(
  supabase: SupabaseClient,
  agent: NotifyAgent,
  callId: string,
): Promise<void> {
  if (!agent.notificationEmail) return

  // Kollas före bokningen: utan leverantör inställd skulle raden annars bokas
  // och släppas igen vid varje sidladdning, helt i onödan.
  const configured = isEmailConfigured()
  if (!configured.ok) {
    console.warn(`[call-notify] Hoppar över notis — ${configured.reason}`)
    return
  }

  // Utan absolut bas blir länken i mejlet oanvändbar, så notisen hoppas över
  // hellre än att skickas utan väg tillbaka till samtalet.
  const base = process.env.APP_BASE_URL?.trim().replace(/\/$/, '')
  if (!base) {
    console.error('[call-notify] APP_BASE_URL saknas — hoppar över notis')
    return
  }

  // ── Boka raden ────────────────────────────────────────────────────────────
  // Åldersgränsen sitter här och inte i utskicket: ett mejl med rubriken "Nytt
  // samtal" om något som hände för två veckor sedan är brus. Att den som just
  // slagit på notiser inte får ett mejl per gammalt samtal sköts separat, av
  // /api/public-agent/[shareId]/settings, som stämplar allt befintligt som
  // redan notiserat.
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000).toISOString()

  const { data, error } = await supabase
    .from('call_logs')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', callId)
    .eq('agent_id', agent.id)
    .is('notified_at', null)
    .gte('created_at', cutoff)
    .select('public_ref, caller_name, from_number, summary, contact_request, contact_note, created_at')
    .maybeSingle()

  if (error) {
    // Migration 030 inte körd än — notiser är helt enkelt inte påslagna.
    if (!isMissingColumn(error)) console.error(`[call-notify] Kunde inte boka samtalet: ${error.message}`)
    return
  }
  // Ingen rad: redan notiserad, bokad av en parallell körning, eller för gammal.
  if (!data) return

  const row = data as ClaimedRow

  const built = buildCallNotification({
    callerName: row.caller_name,
    fromNumber: row.from_number,
    summary: row.summary ?? 'Samtalet har ingen sammanfattning.',
    contactRequest: REQUESTS.find(r => r === row.contact_request) ?? null,
    contactNote: row.contact_note,
    startedAt: row.created_at,
    url: callUrl(base, agent.shareId, row.public_ref),
    businessName: agent.businessName,
  })

  const result = await sendEmail({ to: agent.notificationEmail, ...built })

  if (result.status === 'sent') {
    console.log(`[call-notify] Notis skickad för samtal ${callId} (${result.id})`)
    return
  }

  // ── Släpp bokningen så nästa sidladdning försöker igen ────────────────────
  const reason = result.status === 'failed' ? result.error : result.reason
  console.error(`[call-notify] Notis misslyckades för samtal ${callId}: ${reason}`)

  const { error: releaseError } = await supabase
    .from('call_logs')
    .update({ notified_at: null })
    .eq('id', callId)
    .eq('agent_id', agent.id)
  if (releaseError) {
    // Raden står kvar som notiserad utan att mejlet gick ut. Hellre en missad
    // notis än en dubblett, så den lämnas som den är.
    console.error(`[call-notify] Kunde inte släppa bokningen för ${callId}: ${releaseError.message}`)
  }
}
