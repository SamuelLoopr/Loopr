import type { SupabaseClient } from '@supabase/supabase-js'
import { applyConversation, enrichCall, type ElevenLabsConversation, type PendingRow } from '@/lib/call-sync'
import { isMissingColumn } from '@/lib/db-errors'

// Tar emot ett avslutat samtal från ElevenLabs post-call-webhook och kör hela
// kedjan direkt: transkript och längd in i raden, Claude-sammanfattning,
// kostnad, och mejlnotis till klienten.
//
// Tidigare hände allt det här först när någon öppnade BOS-länken
// (/api/public-agent/[shareId]/calls). Ett samtal på fredag kväll låg orört
// till någon tittade. Sidladdningssynken finns kvar och gör exakt samma sak —
// nu som skyddsnät för de samtal webhooken missar, inte som enda vägen.
//
// Båda vägarna kör samma funktioner i lib/call-sync.ts, så ett samtal ser
// likadant ut i BOS oavsett vem som kom först. Skrivningarna är villkorade på
// radens tillstånd, och mejlet "bokar" raden med notified_at
// (lib/call-notify.ts), så det tål att båda vägarna krockar.
//
// Serveronly: körs på service-rollen från webhook-routen.

/** Conversation-id:t som /api/twilio/incoming-call stoppade in i error_message. */
const CONVERSATION_ID = /^conv_[A-Za-z0-9]+$/

/** Webhookens `data` — konversationen plus dess id. */
export interface PostCallData extends ElevenLabsConversation {
  conversation_id?: string | null
  /**
   * ElevenLabs-agenten. Oanvändbar för avgränsning: alla Loopr-kunder delar
   * samma agent, så fältet är identiskt för varje kund. Raden hittas på
   * conversation_id i stället, och det är raden som bär vårt eget agent_id.
   */
  agent_id?: string | null
}

export type IngestOutcome =
  /** Samtalet hittades och behandlades. */
  | 'ok'
  /** Konversationen hör inte till något loggat samtal — t.ex. en säljdemo i webbläsaren. */
  | 'unknown_call'
  /** Payloaden saknar ett användbart conversation_id. */
  | 'malformed'
  /** Databasen svarade fel. Värt ett omförsök. */
  | 'db_error'

export interface IngestResult {
  outcome: IngestOutcome
  /**
   * Resten av kedjan — Claude-sammanfattningen och mejlet — som en funktion
   * routen kör efter att svaret gått iväg (next/server `after`).
   *
   * Delat så eftersom ElevenLabs vill ha 200 snabbt, och en modellkörning tar
   * sekunder. Det snabba steget (transkriptet in i raden) sker före svaret och
   * syns därför i statuskoden; det långsamma hålls utanför. Misslyckas det
   * långsamma steget tar sidladdningssynken samtalet vid nästa besök, vilket
   * är precis vad den finns kvar för.
   */
  finish?: () => Promise<void>
}

interface AgentRow {
  id: string
  name: string
  business_name: string | null
  public_share_id: string | null
  client_mode?: boolean | null
  notification_email?: string | null
}

const AGENT_TIERS = [
  'id, name, business_name, public_share_id, client_mode, notification_email', // 030
  'id, name, business_name, public_share_id, client_mode',                     // 029
  'id, name, business_name, public_share_id',
]

export async function ingestConversation(
  supabase: SupabaseClient,
  data: PostCallData,
): Promise<IngestResult> {
  const conversationId = data.conversation_id?.trim()
  if (!conversationId || !CONVERSATION_ID.test(conversationId)) return { outcome: 'malformed' }

  // Raden hittas på conversation_id, inte på payloadens agent_id — se
  // kommentaren vid PostCallData ovan. Mönstret är säkert att bygga så här
  // eftersom id:t just kontrollerats mot CONVERSATION_ID: det kan inte
  // innehålla ett `%`. Understrecket i "conv_" är visserligen ett
  // jokertecken för ett tecken, men alla id:n har just det tecknet där.
  const { data: rows, error } = await supabase
    .from('call_logs')
    .select('id, agent_id, status, error_message, created_at')
    .like('error_message', `%conversation_id=${conversationId}%`)
    .limit(2)

  if (error) {
    console.error(`[call-ingest] Kunde inte slå upp ${conversationId}: ${error.message}`)
    return { outcome: 'db_error' }
  }
  if (!rows || rows.length === 0) return { outcome: 'unknown_call' }
  if (rows.length > 1) {
    // Har aldrig inträffat. Att avstå är rätt: vi vet inte vilken rad som är
    // samtalet, och att skriva fel klients samtal är värre än att vänta på
    // att sidladdningssynken tar det.
    console.error(`[call-ingest] ${conversationId} matchar ${rows.length} samtal — avstår`)
    return { outcome: 'db_error' }
  }

  const row = rows[0] as PendingRow & { agent_id: string | null; status: string }
  if (!row.agent_id) return { outcome: 'unknown_call' }

  const agent = await loadAgent(supabase, row.agent_id)
  if (!agent) return { outcome: 'db_error' }

  // 1. Transkript, längd, sentiment, Twilios SID och ElevenLabs-kostnaden in i
  //    raden. Villkorat på status = 'in_progress', så en rad som
  //    sidladdningssynken redan hunnit stänga lämnas i fred.
  await applyConversation(supabase, row, data)

  // 2. Sammanfattning, kontaktförfrågan, lösningsgrad — och mejlet. Lämnas
  //    till routen att köra efter svaret; se IngestResult.finish.
  return {
    outcome: 'ok',
    finish: () => enrichCall(supabase, agent, row.id),
  }
}

/**
 * Agenten bakom samtalet, i den form synken och notisen behöver.
 *
 * Notisadressen plockas bara upp i klientläge, precis som i
 * /api/public-agent/[shareId]/calls: en säljdemo ska inte mejla någon.
 */
async function loadAgent(
  supabase: SupabaseClient,
  agentId: string,
): Promise<{ id: string; shareId: string; businessName: string; notificationEmail: string | null } | null> {
  for (const cols of AGENT_TIERS) {
    const { data, error } = await supabase.from('agents').select(cols).eq('id', agentId).maybeSingle()

    if (error) {
      if (isMissingColumn(error)) continue
      console.error(`[call-ingest] Kunde inte läsa agent: ${error.message}`)
      return null
    }
    if (!data) return null

    const row = data as unknown as AgentRow
    const clientMode = row.client_mode === true
    return {
      id: row.id,
      shareId: row.public_share_id ?? '',
      businessName: row.business_name || row.name,
      notificationEmail: clientMode ? (row.notification_email ?? null) : null,
    }
  }
  return null
}
