// Rate limiting för publika routes, anropad från middleware.ts (edge).
//
// Räknaren ligger i databasen (public_rate_limit, funktionen rate_limit_hit i
// 050) så att den gäller över alla serverinstanser. Nyckeln är en SHA-256 av
// IP-adressen och gruppen, med service-nyckeln som salt: ingen IP-adress
// sparas, och hashen går inte att räkna tillbaka utan nyckeln.
//
// Fel eller långsam databas släpper igenom anropet. Rate limiting får aldrig
// vara det som gör att en kund inte kommer åt sina samtal.

export interface RateLimitGroup {
  /** Prefix på sökvägen. */
  prefix: string
  /** Namn i nyckeln. */
  name: string
  windowSeconds: number
  max: number
}

/**
 * BOS hämtar om var 20:e–120:e sekund per flik och gör enstaka ändringar —
 * långt under gränsen även med flera flikar. /api/public/* är en hämtning per
 * sidvisning.
 */
export const RATE_LIMITS: RateLimitGroup[] = [
  { prefix: '/api/public-agent', name: 'bos', windowSeconds: 600, max: 300 },
  { prefix: '/api/public', name: 'public', windowSeconds: 600, max: 60 },
]

const TIMEOUT_MS = 800

function clientIp(req: Request): string {
  return req.headers.get('x-real-ip')?.trim() || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'okänd'
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

/** true = över gränsen, svara 429. false = släpp igenom (också vid fel). */
export async function overRateLimit(req: Request, group: RateLimitGroup): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return false
  try {
    const bucket = `${group.name}:${await sha256(`${key}|${clientIp(req)}`)}`
    const res = await fetch(`${url}/rest/v1/rpc/rate_limit_hit`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_bucket: bucket, p_window_seconds: group.windowSeconds, p_max: group.max }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return false
    return (await res.json()) === false
  } catch {
    return false
  }
}
