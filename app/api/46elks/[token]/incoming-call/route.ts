import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { ELKS_FAILURE_TEXT, verifyElksCallback } from '@/lib/elks-callback'
import { normalizeE164 } from '@/lib/phone'

// 46elks voice_start: någon har ringt vårt svenska nummer.
//
// Svaret är en call action i JSON (46elks docs/call-actions). Vi svarar med
// `connect` mot en SIP-URI hos ElevenLabs, och därmed är vi ur vägen —
// ljudet går 46elks -> ElevenLabs direkt, aldrig genom oss. Ingen WebSocket,
// ingen ljudkonvertering, inget långlivat.
//
// Avsiktligt nästan tom. Det enda den gör är att avgöra OM numret är vårt och
// svara med vart samtalet ska. Allt annat — agentens prompt och röst, raden i
// call_logs — sker i /api/webhooks/elevenlabs/conversation-init, som till
// skillnad från här får veta conversation_id. Anledningen är att varje
// millisekund här är tystnad i örat på den som ringt.
//
// RÖR INTE app/api/twilio/incoming-call. Den finska Twilio-vägen är kvar
// oförändrad som reträtt, och de två delar ingen kod med avsikt: en ändring
// här får aldrig kunna fälla den fungerande vägen.
//
// SÄKERHET: token i URL:en plus IP-kontroll. 46elks signerar inte sina
// callbacks — se lib/elks-callback.ts för exakt hur mycket svagare det är än
// Twilios HMAC, och varför det inte går att göra bättre.

export const dynamic = 'force-dynamic'

/** ElevenLabs SIP-ingång. Deras docs/phone-numbers/sip-trunking. */
const SIP_HOST = process.env.ELEVENLABS_SIP_HOST?.trim() || 'sip.rtc.elevenlabs.io:5060'

/**
 * TCP. Både alternativen är uppmätta på riktiga samtal 2026-10-03 — ändra inte
 * utan att läsa det här.
 *
 *   TCP   uppkoppling OK, ljud OK i båda riktningar, men ElevenLabs SIP BYE
 *         tappas: när agenten anropar end_call avslutas konversationen medan
 *         telefonlinjen ligger kvar. Uppmätt på samma samtal från båda hållen:
 *           agenten la på   46elks-ben 56 s  mot konversation 37 s  → 19 s kvar
 *           kunden la på    46elks-ben 13 s  mot konversation 13 s  → lika
 *
 *   UDP   VÄRRE. 46elks markerar benet state=failed utan längd och utan
 *         kostnad, och ElevenLabs får inget ljud från den som ringer —
 *         agenten pratar i tomma intet och frågar "är du kvar i luren?" tills
 *         den avslutar själv. Två samtal, 37 s och 41 s, båda likadana.
 *         Mediasessionen etableras alltså inte, trots att signalleringen
 *         kommer så långt att en konversation startar.
 *
 * TCP är därmed det enda läget där samtalet faktiskt fungerar. Att linjen
 * ligger kvar efter agentens farväl är en känd kvarvarande defekt, inte något
 * som blir bättre av att byta transport. 46elks erbjuder inte TLS i sin
 * SIP-URI, så det finns inget tredje alternativ.
 */
const SIP_TRANSPORT = process.env.ELEVENLABS_SIP_TRANSPORT?.trim() || 'tcp'

/** Lägg på utan att koppla. 46elks docs/voice-hangup: "busy", "reject" eller "404". */
const UNKNOWN_NUMBER = { hangup: '404' }

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const auth = verifyElksCallback(req, token)
  if (!auth.ok) {
    console.warn(`[46elks/incoming-call] Avvisad (${auth.ip ?? 'okänd IP'}): ${ELKS_FAILURE_TEXT[auth.reason]}`)
    // 404 och inget mer: en felaktig token ska inte avslöja att vägen finns.
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 46elks postar formulärkodat. JSON hanteras också, så ett framtida byte hos
  // dem inte tystar varje samtal medan vi felsöker.
  const raw = await req.text()
  let fields: Record<string, string> = {}
  try {
    fields = raw.trimStart().startsWith('{')
      ? Object.fromEntries(Object.entries(JSON.parse(raw) as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
      : Object.fromEntries(new URLSearchParams(raw))
  } catch {
    console.error('[46elks/incoming-call] Kunde inte tolka bodyn')
  }

  const to = fields.to?.trim()
  const from = fields.from?.trim() ?? null
  const callId = fields.callid?.trim() ?? null

  if (!to) {
    console.error('[46elks/incoming-call] Anropet saknade "to"')
    return NextResponse.json(UNKNOWN_NUMBER)
  }

  const parsed = normalizeE164(to)
  const e164 = parsed.ok ? parsed.e164 : to

  // Enda databasfrågan på den här vägen, och den finns av en anledning: utan
  // den skulle vi koppla vilket nummer som helst vidare till ElevenLabs och
  // betala för samtalet. Matchas exakt, precis som Twilio-vägen gör.
  const supabase = createSupabaseServiceClient()
  const { data: known, error } = await supabase
    .from('phone_numbers')
    .select('agent_id')
    .eq('phone_number', e164)
    .maybeSingle()

  if (error) {
    // Databasen nere får inte innebära att samtalet tystnar utan förklaring.
    // Vi kopplar vidare ändå: ElevenLabs trunk är ändå begränsad till våra
    // egna registrerade nummer, så det kan inte missbrukas härifrån.
    console.error(`[46elks/incoming-call] Uppslagning av ${e164} misslyckades: ${error.message}`)
  } else if (!known?.agent_id) {
    console.warn(`[46elks/incoming-call] ${e164} finns inte i phone_numbers — lägger på (samtal ${callId})`)
    return NextResponse.json(UNKNOWN_NUMBER)
  }

  // Identifieraren i SIP-URI:n är det uppringda numret, vilket är hur
  // ElevenLabs vet vilket av sina trunk-nummer samtalet gäller och därmed
  // vilken agent som ska svara.
  const sipUri = `sip:${e164}@${SIP_HOST};transport=${SIP_TRANSPORT}`
  console.log(`[46elks/incoming-call] ${from ?? 'okänd'} -> ${e164}, kopplar till ${sipUri} (samtal ${callId})`)

  return NextResponse.json({ connect: sipUri })
}
