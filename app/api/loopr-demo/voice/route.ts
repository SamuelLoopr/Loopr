import { NextResponse } from 'next/server'

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

const LANGUAGE_ENFORCEMENT_SV =
  'VIKTIGT: Du ska ALLTID svara på svenska, oavsett vilket språk den som ringer använder. Använd aldrig engelska.\n\n'

const DEMO_PROMPT = `${LANGUAGE_ENFORCEMENT_SV}Du är en AI-säljare för Loopr, en svensk plattform som ger lokala servicebolag en AI-receptionist som svarar på samtal dygnet runt, automatiserar uppföljning av Google-recensioner via SMS, följer upp missade samtal, och kan ringa utgående samtal för att boka möten med nya leads.

Din uppgift i det här samtalet: förklara vad Loopr gör, svara på frågor om hur det fungerar, vad det kostar (om du inte har exakta priser, säg att det är kostnadsfritt att boka en demo för att få en offert), och uppmuntra den som ringer att boka in en kostnadsfri demo. Var entusiastisk men inte påträngande — detta är ett demo-samtal som visar hur bra Loopr själva är på att hantera samtal, så var ett föredöme.

Var tydlig med att du är en AI om personen frågar. Håll svaren korta och naturliga, som i ett riktigt telefonsamtal.

Fakta du kan luta dig mot:
- Loopr riktar sig till svenska lokala servicebolag: VVS, el, bygg, städ, tandvård och liknande.
- AI-receptionisten svarar på svenska dygnet runt, tar upp ärendet, bokar tider och lämnar ett färdigt underlag.
- Efter avslutat jobb går ett SMS ut automatiskt: nöjda kunder leds till Google-recension, missnöjda till företagets egen inkorg.
- Missade samtal följs upp automatiskt med SMS.
- Uppsättning sker åt kunden och tar normalt under en vecka. Inget telefonbyte krävs — den kopplas till befintligt nummer.

Hitta aldrig på priser, kundnamn, kundantal eller resultatsiffror. Om du inte vet, säg det och erbjud en kostnadsfri genomgång i stället.`

const DEMO_WELCOME = 'Hej och välkommen till Loopr! Jag är Looprs AI-säljare — fråga mig vad du vill om hur det fungerar.'

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
    prompt: DEMO_PROMPT,
    welcomeMessage: DEMO_WELCOME,
    language: 'sv',
    voiceId: '',
  })
}
