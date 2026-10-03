import crypto from 'node:crypto'

// Verifiering av ElevenLabs signatur på post-call-webhooken.
//
// Utan den är /api/webhooks/elevenlabs/post-call ett öppet gränssnitt: vem som
// helst kunde POSTa ett påhittat transkript med ett conversation_id och få oss
// att skriva det till ett samtal och mejla det till klienten. Samma resonemang
// som för Twilio (lib/twilio-signature.ts) — signaturen är det som skiljer ett
// riktigt anrop från ett påhittat.
//
// Algoritmen står inte i dokumentationen; den säger bara "använd vårt SDK".
// Den här implementationen är läst ur @elevenlabs/elevenlabs-js 2.70.0
// (wrapper/webhooks.js, constructEvent) 2026-10-02:
//
//   header   ElevenLabs-Signature: t=<unix-sekunder>,v0=<hex>
//   hash     HMAC-SHA256 över `<t>.<rå body>` med webhook-hemligheten
//   fönster  30 minuter
//
// Skriven här i stället för via SDK:t eftersom paketet inte är ett beroende i
// projektet och det här är det enda vi skulle använda det till — samma skäl som
// för twilio-paketet.
//
// Till skillnad från Twilio signerar ElevenLabs INTE URL:en, bara tidsstämpel
// och body. Hela www/icke-www-problematiken i twilio-signature.ts finns alltså
// inte här, och bodyn måste läsas rå (request.text()) innan den tolkas: en
// JSON.parse + stringify ändrar nyckelordning och blanktecken, och då stämmer
// ingen signatur.

export const SIGNATURE_HEADER = 'elevenlabs-signature'

/** Hur gammal en signatur får vara. Samma 30 minuter som SDK:t använder. */
const MAX_AGE_MS = 30 * 60 * 1000

/**
 * Hur långt in i framtiden en tidsstämpel får ligga.
 *
 * SDK:t kontrollerar bara att stämpeln inte är för GAMMAL, så `t=` godtas
 * oavsett hur långt fram den pekar. Det gör en avlyssnad begäran
 * återanvändbar i evighet, vilket är precis vad tidsfönstret ska hindra, så
 * här kontrolleras båda riktningarna. Marginalen finns för klockskillnad
 * mellan deras servrar och våra.
 */
const MAX_SKEW_MS = 5 * 60 * 1000

export type SignatureFailure =
  | 'missing_header'
  | 'missing_secret'
  | 'malformed'
  | 'expired'
  | 'future'
  | 'mismatch'

export type SignatureResult = { ok: true } | { ok: false; reason: SignatureFailure }

/** Vad som gick fel, i klartext för loggen. Aldrig i ett svar till anroparen. */
export const FAILURE_TEXT: Record<SignatureFailure, string> = {
  missing_header: `begäran saknar ${SIGNATURE_HEADER}`,
  missing_secret: 'ELEVENLABS_WEBHOOK_SECRET saknas i miljön',
  malformed: `${SIGNATURE_HEADER} har inte formen t=<tid>,v0=<hex>`,
  expired: 'tidsstämpeln är äldre än 30 minuter',
  future: 'tidsstämpeln ligger i framtiden',
  mismatch: 'signaturen stämmer inte med bodyn',
}

/** Signaturen ElevenLabs skickar för en given body och tidsstämpel. */
export function computeSignature(secret: string, timestamp: string, rawBody: string): string {
  return (
    'v0=' +
    crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex')
  )
}

/**
 * Konstanttidsjämförelse.
 *
 * Ett rakt `===` på en hemlighet läcker tidsinformation — SDK:t gör just det,
 * men här finns redan twilio-signature.ts som gör det rätt, så det görs rätt.
 */
function equals(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

export function verifyElevenLabsSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  now: number = Date.now(),
): SignatureResult {
  if (!header) return { ok: false, reason: 'missing_header' }
  if (!secret) return { ok: false, reason: 'missing_secret' }

  // Headern är kommaseparerad och ordningen är inte garanterad, så delarna
  // plockas på prefix i stället för på position.
  const parts = header.split(',').map(p => p.trim())
  const timestamp = parts.find(p => p.startsWith('t='))?.slice(2)
  const signature = parts.find(p => p.startsWith('v0='))

  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) {
    return { ok: false, reason: 'malformed' }
  }

  const signedAt = Number(timestamp) * 1000
  if (now - signedAt > MAX_AGE_MS) return { ok: false, reason: 'expired' }
  if (signedAt - now > MAX_SKEW_MS) return { ok: false, reason: 'future' }

  if (!equals(computeSignature(secret, timestamp, rawBody), signature)) {
    return { ok: false, reason: 'mismatch' }
  }

  return { ok: true }
}
