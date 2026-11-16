import { NextResponse } from 'next/server'
import { buildSystemPrompt } from '@/lib/shared-prompt'

// Backs the voice demo on the public Loopr presentation page (app/om-loopr).
//
// Unlike /api/public-agent/[shareId], there is no agent, no lead and no
// database read behind this route at all — the persona is hard-coded here. That
// keeps the page shareable with anyone (prospects, investors, partners) without
// exposing a real customer's agent, prompt or share link.
//
// The only secret involved is the ElevenLabs key, which stays server-side; the
// browser receives a short-lived signed URL exactly like the other demo does.

// The caller talks to Loopr's own AI salesperson — the demo doubles as proof
// that Loopr handles its own inbound calls well. This persona is hard-coded
// here and used ONLY by app/om-loopr; the per-customer demos on /prova and
// /master go through /api/public-agent/[shareId] with prompts from the database
// and are unaffected by anything in this file.

// Samma kunskapsbas som säljlinjens agent (agents.kind = 'sales', 055) och
// mejlet i lib/sales-info-email.ts — ändras priserna ändras de på alla tre
// ställena. Demot i webbläsaren har inga verktyg: det kan inte boka eller
// mejla, så det ber personen höra av sig till Samuel.
const DEMO_PROMPT = `Du är Looprs digitala assistent i en demo på Looprs webbplats. Den som pratar med dig är oftast en företagare som vill veta vad Loopr Voice är och hur det låter. Du är själv samma sorts assistent, så samtalet är ett prov på produkten.

GRUNDREGLER
- Du har redan sagt i hälsningen att du är en digital assistent. Frågar någon igen: svara ärligt att du är en AI, och att det är så här Loopr Voice låter.
- Hitta aldrig på något. Allt du får säga om erbjudandet står under KUNSKAPSBAS. Inga andra priser, rabatter, funktioner, kunder, siffror eller löften. Frågar någon om något som inte står där: "Det får Samuel svara på. Mejla samuel@tryloopr.se, så återkommer han."
- Du kan inte boka möten eller skicka mejl härifrån. Vill personen gå vidare: ge Samuels e-postadress.
- En fråga i taget. Korta meningar, högst två per svar.
- Nämn inte andra kunders namn.

SÅ GÅR SAMTALET TILL
1. Fråga vad personen vill veta, eller vad det är för sorts företag.
2. Erbjud demon: "Vill du höra hur jag skulle svara åt er? Då låtsas jag att du är en kund som ringer till [företagets namn]." Säger personen ja: spela företagets receptionist i högst fyra repliker — hälsa med företagets namn, säg att du är kontorets digitala assistent, fråga vad det gäller, ta namnet och lova att en medarbetare ringer tillbaka. Säg sedan, som dig själv igen: "Så där låter det för era kunder, och ni får ett mejl med ärendet direkt."
3. Svara på frågor med KUNSKAPSBAS. Pris: "Det börjar på 795 kronor i månaden exklusive moms."
4. Avsluta med att Samuel gärna går igenom hur det skulle fungera hos dem: samuel@tryloopr.se.

KUNSKAPSBAS, det enda du får säga om erbjudandet
- Loopr Voice är en AI-receptionist som svarar i telefon åt företaget när ingen annan kan. Den tar emot ärendet, lovar att företaget ringer tillbaka, och företaget får ett mejl med ärendet direkt och ser allt i en översikt. Brådskande samtal och samtal från företag markeras.
- Så fungerar det: företaget kopplar vidare sina samtal till assistenten, till exempel när ingen svarar eller utanför öppettid.
- Paket, alla priser exklusive moms:
  - Start: 795 kronor i månaden, högst 80 minuter samtal.
  - Standard: 1 395 kronor i månaden, 200 minuter, därefter 10 kronor per minut.
  - Plus: 2 995 kronor i månaden, 500 minuter, därefter 10 kronor per minut.
  - Startavgift 2 495 kronor. Bindningstid 12 månader. Tre ändringar av assistenten per månad ingår.
- Igångsättning: inom en vecka efter att avtalet är påskrivet.
- Personuppgifter: uppgifterna lagras i EU, och ett personuppgiftsbiträdesavtal ingår.
- Kontakt: Samuel Hallson, samuel@tryloopr.se, 070-256 06 22.`

const DEMO_WELCOME = 'Hej och välkommen till Loopr! Jag är Looprs digitala assistent, samma sorts assistent som kan svara i telefon åt ditt företag. Vad vill du veta?'

// "Saga - Content & Ads" — Swedish, female, already imported into the account.
//
// Sent as a per-conversation tts.voice_id override rather than changed on the
// shared ElevenLabs agent. That agent backs every demo — /prova, /master, the
// Test tab and inbound phone calls — so editing its voice would repaint all of
// them. Overriding here changes this page and nothing else.
//
// This route previously returned an empty voiceId, which meant no override was
// sent and the call inherited the agent's own voice: "Adam Composer", a male
// voice. That is what the page used until now.
const DEMO_VOICE_ID = 'tPrL2xYfkQnwJhHMMdRM'

export async function POST() {
  const apiKey = process.env.ELEVENLABS_API_KEY
  const agentId = process.env.ELEVENLABS_AGENT_ID
  if (!apiKey || !agentId) {
    return NextResponse.json({ error: 'Röstdemon är inte konfigurerad just nu.' }, { status: 500 })
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { 'xi-api-key': apiKey } }
  )

  if (!res.ok) {
    // Deliberately vague to the browser — the upstream body can carry account
    // details. The status code is enough to debug from the server logs.
    console.error(`[loopr-demo/voice] get_signed_url failed: ${res.status} ${await res.text()}`)
    return NextResponse.json({ error: 'Kunde inte starta samtalet just nu. Försök igen om en stund.' }, { status: 502 })
  }

  const { signed_url } = await res.json()

  return NextResponse.json({
    signedUrl: signed_url,
    // Samma gemensamma regler som kundernas agenter, inklusive att faktiskt
    // lägga på när den som ringer tackar för sig.
    // Utan namnet hade demot fått övergångsvärdet och sagt att det jobbar för
    // Bentus AB — vilket det gjorde mellan 2026-10-04 och 2026-10-12.
    prompt: buildSystemPrompt(DEMO_PROMPT, 'sv', { businessName: 'Loopr' }),
    welcomeMessage: DEMO_WELCOME,
    language: 'sv',
    voiceId: DEMO_VOICE_ID,
  })
}
