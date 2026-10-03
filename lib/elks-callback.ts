import crypto from 'node:crypto'

// Autentisering av 46elks callbacks.
//
// ── LÄS DETTA INNAN DU LITAR PÅ SKYDDET ─────────────────────────────────────
// Det här är SVAGARE än lib/twilio-signature.ts och lib/elevenlabs-signature.ts,
// och det går inte att göra bättre. Twilio och ElevenLabs signerar varje anrop
// med HMAC över innehållet, så ett anrop inte kan återanvändas eller hittas på.
// 46elks signerar ingenting. Deras egen rekommendation, ordagrant ur
// docs/verify-callback-origin: "The recommended approach is using IP
// firewalling to only allow requests from our trusted IP addresses."
//
// Alltså två lager, inget av dem en signatur:
//
//   1. En ogissbar URL. Vägen innehåller ELKS_WEBHOOK_TOKEN, som bara vi och
//      46elks känner. Det är det primära skyddet.
//   2. Avsändarens IP mot deras dokumenterade adresser. Sekundärt, eftersom
//      IP-huvudena sätts av proxyn framför oss och inte av avsändaren själv —
//      men ett klientskickat x-forwarded-for kan inte uteslutas med säkerhet,
//      så det ensamt vore inget skydd.
//
// Skillnaden i praktiken: en token är en statisk hemlighet som läcker om den
// loggas någonstans på vägen, och den säger ingenting om att just DEN här
// bodyn kommer från 46elks. En HMAC gör båda. Förväxla inte nivåerna.
//
// Vad som skulle hända om någon kom igenom: de kan få oss att svara med en
// SIP-URI till ett av våra egna nummer. De kan inte skriva i databasen härifrån
// (routen skriver inget) och de kan inte starta ett samtal hos ElevenLabs,
// eftersom ElevenLabs trunk bara släpper in 46elks egna SIP-adresser.

/** 46elks dokumenterade adresser för callbacks (docs/verify-callback-origin). */
export const ELKS_CALLBACK_IPS = [
  '176.10.154.199',
  '85.24.146.132',
  '185.39.146.243',
  '2001:9b0:2:902::199',
] as const

export type ElksAuthFailure = 'no_token_configured' | 'bad_token' | 'bad_ip'

export const ELKS_FAILURE_TEXT: Record<ElksAuthFailure, string> = {
  no_token_configured: 'ELKS_WEBHOOK_TOKEN saknas i miljön',
  bad_token: 'token i URL:en stämmer inte',
  bad_ip: 'avsändarens IP finns inte bland 46elks dokumenterade adresser',
}

/** Konstanttidsjämförelse, så token inte går att gissa fram tecken för tecken. */
function equals(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

/**
 * Avsändarens IP så som proxyn framför oss rapporterar den.
 *
 * x-real-ip först: Vercel sätter den till den faktiska klienten. Annars första
 * posten i x-forwarded-for, som är klienten när kedjan är välformad.
 */
export function callerIp(req: Request): string | null {
  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return real
  const fwd = req.headers.get('x-forwarded-for')
  return fwd?.split(',')[0]?.trim() || null
}

/**
 * Är anropet från 46elks, så långt vi kan avgöra?
 *
 * `requireIp` false släpper igenom en okänd IP med bara token kvar som skydd.
 * Finns för att deras adresser kan ändras — de meddelar via mejl, men en
 * ändring vi inte hunnit uppdatera skulle annars tysta varje kundsamtal.
 * Standard är att kräva båda.
 */
export function verifyElksCallback(
  req: Request,
  token: string,
  { requireIp = true }: { requireIp?: boolean } = {},
): { ok: true; ip: string | null } | { ok: false; reason: ElksAuthFailure; ip: string | null } {
  const ip = callerIp(req)
  const expected = process.env.ELKS_WEBHOOK_TOKEN?.trim()

  if (!expected) return { ok: false, reason: 'no_token_configured', ip }
  if (!token || !equals(expected, token)) return { ok: false, reason: 'bad_token', ip }

  if (requireIp && ip && !ELKS_CALLBACK_IPS.includes(ip as (typeof ELKS_CALLBACK_IPS)[number])) {
    return { ok: false, reason: 'bad_ip', ip }
  }

  return { ok: true, ip }
}
