import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { ingestConversation, type PostCallData } from '@/lib/call-ingest'
import {
  FAILURE_TEXT,
  SIGNATURE_HEADER,
  verifyElevenLabsSignature,
} from '@/lib/elevenlabs-signature'

// ElevenLabs post-call-webhook: ett samtal har avslutats och analyserats.
//
// Det här är det som gör att ett samtal behandlas när det tar slut i stället
// för när någon öppnar BOS-länken. Kedjan — transkript, Claude-sammanfattning,
// kostnad, mejlnotis — ligger i lib/call-ingest.ts och delas med
// sidladdningssynken, som finns kvar som skyddsnät.
//
// SÄKERHET. Routen är med avsikt oautentiserad i middleware.ts (ElevenLabs har
// ingen session), så signaturen är hela skyddet. Utan den kunde vem som helst
// POSTa ett påhittat transkript med ett conversation_id och få oss att skriva
// det till ett samtal och mejla det till klienten som om det var sagt i
// telefon. Verifieringen sker därför FÖRST, över den råa bodyn, innan något
// tolkas eller skrivs — se lib/elevenlabs-signature.ts.
//
// Payloadens agent_id går inte att lita på för avgränsning: alla Loopr-kunder
// delar samma ElevenLabs-agent. Samtalet hittas på conversation_id, och det är
// den raden som bär vårt eget agent_id.
//
// SVARSKODER. ElevenLabs räknar bara 200 som lyckat och stänger av en webhook
// efter 10 fel i rad (om senaste lyckade leverans är äldre än 7 dagar).
// Omleverans sker bara vid 5xx, 429 och 408 — aldrig vid 4xx. Därför:
//   200  behandlat, eller ingenting som rör oss (säljdemo i webbläsaren,
//        händelsetyper vi inte prenumererar på)
//   401  signaturen håller inte — ska inte göras om
//   400  bodyn går inte att tolka trots giltig signatur — blir inte bättre
//   500  databasen svarade fel, eller hemligheten saknas i miljön — gör om

export const dynamic = 'force-dynamic'

interface WebhookEvent {
  type?: string
  data?: PostCallData
  event_timestamp?: number
}

export async function POST(req: NextRequest) {
  // Rå text, inte req.json(): signaturen räknas över bodyns exakta byte. En
  // JSON.parse + stringify ändrar nyckelordning och blanktecken, och då
  // stämmer ingen signatur någonsin.
  const raw = await req.text()

  const verified = verifyElevenLabsSignature(
    raw,
    req.headers.get(SIGNATURE_HEADER),
    process.env.ELEVENLABS_WEBHOOK_SECRET,
  )
  if (!verified.ok) {
    console.warn(`[elevenlabs-webhook] Avvisad: ${FAILURE_TEXT[verified.reason]}`)
    // Saknad hemlighet är vårt fel, inte avsändarens: 500 gör att ElevenLabs
    // försöker igen, och ett omförsök lyckas när nyckeln är på plats.
    const status = verified.reason === 'missing_secret' ? 500 : 401
    return NextResponse.json({ error: 'Ogiltig signatur' }, { status })
  }

  let event: WebhookEvent
  try {
    event = JSON.parse(raw) as WebhookEvent
  } catch {
    console.error('[elevenlabs-webhook] Giltig signatur men bodyn är inte JSON')
    return NextResponse.json({ error: 'Ogiltig body' }, { status: 400 })
  }

  // Vi prenumererar bara på "transcript", men en webhook kan slås på för fler
  // händelser i deras gränssnitt. Allt annat kvitteras utan att göra något, i
  // stället för att räknas som ett misslyckande och dra mot avstängning.
  if (event.type !== 'post_call_transcription') {
    return NextResponse.json({ received: true, ignored: event.type ?? 'okänd typ' })
  }
  if (!event.data) {
    return NextResponse.json({ error: 'Saknar data' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()
  const { outcome, finish } = await ingestConversation(supabase, event.data)

  // Sammanfattningen och mejlet behöver inte hålla svaret kvar — de körs när
  // 200 redan gått iväg.
  if (finish) {
    after(
      finish().catch(err => console.error('[elevenlabs-webhook] Efterarbetet misslyckades:', err)),
    )
  }

  switch (outcome) {
    case 'ok':
      return NextResponse.json({ received: true })

    case 'unknown_call':
      // Webhooken gäller alla samtal på den delade agenten, inklusive
      // säljdemos i webbläsaren som aldrig får en call_logs-rad. Inget fel.
      return NextResponse.json({ received: true, ignored: 'inget loggat samtal' })

    case 'malformed':
      return NextResponse.json({ error: 'Saknar conversation_id' }, { status: 400 })

    case 'db_error':
      return NextResponse.json({ error: 'Kunde inte behandlas just nu' }, { status: 500 })
  }
}
