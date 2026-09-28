import crypto from 'node:crypto'

// Validation of Twilio's X-Twilio-Signature header.
//
// Without this, /api/twilio/incoming-call is an open endpoint: anyone who POSTs
// a form body with a `To` that matches a registered number makes us fetch an
// ElevenLabs signed URL and write a call_logs row. Twilio signs every webhook,
// so checking the signature is what separates a real call from a forged one.
//
// The algorithm (Twilio's "Security" docs): take the exact URL Twilio was
// configured to call, append every POST parameter sorted by key as key+value
// with no separators, HMAC-SHA1 it with the account's auth token, and base64
// the result.
//
// Implemented here rather than via the `twilio` npm package because the package
// is not a dependency of this project and this is the only thing we would use
// it for.

/**
 * The URL Twilio signed.
 *
 * This must be byte-identical to what is configured on the number, or every
 * signature fails. Behind Vercel's proxy `request.url` carries the internal
 * host, not tryloopr.se, so the public origin is reconstructed explicitly:
 *
 *   1. TWILIO_WEBHOOK_URL   — the exact URL, when it needs to be pinned
 *   2. APP_BASE_URL         — origin + the request's own path
 *   3. x-forwarded-proto/host headers — last resort
 *
 * The query string is included because Twilio signs the full URL.
 */
export function publicWebhookUrl(req: Request, pathname: string, search = ''): string {
  return webhookUrlCandidates(req, pathname, search)[0]
}

/** `https://www.x.se` ⇄ `https://x.se` — the same URL with the other host form. */
function toggleWww(url: string): string | null {
  try {
    const u = new URL(url)
    u.host = u.host.startsWith('www.') ? u.host.slice(4) : `www.${u.host}`
    return u.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

/**
 * Every URL this request might legitimately have been signed over.
 *
 * Twilio signs the URL **it was configured to call**, not the one the request
 * finally lands on. When the configured host redirects — tryloopr.se → 308 →
 * www.tryloopr.se on Vercel — Twilio follows the redirect but keeps the
 * signature it computed for the original host. Validating against only one
 * spelling then rejects every real call with 403, and the caller hears
 * "your call could not be connected" with Twilio reporting Busy, 0 seconds.
 *
 * So both spellings of each candidate are accepted. This does not weaken the
 * check: the auth token is still required, and an attacker gains nothing from
 * us also accepting the www variant of our own domain.
 *
 * Order matters only for publicWebhookUrl()'s logging.
 */
export function webhookUrlCandidates(req: Request, pathname: string, search = ''): string[] {
  const out: string[] = []
  const add = (u: string | null | undefined) => {
    if (!u) return
    const clean = u.replace(/\/$/, '')
    if (!out.includes(clean)) out.push(clean)
    const flipped = toggleWww(clean)
    if (flipped && !out.includes(flipped)) out.push(flipped)
  }

  add(process.env.TWILIO_WEBHOOK_URL?.trim())

  const base = process.env.APP_BASE_URL?.trim()
  if (base) add(`${base.replace(/\/$/, '')}${pathname}${search}`)

  const h = req.headers
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (host) add(`${proto}://${host}${pathname}${search}`)

  return out.length > 0 ? out : ['']
}

/** Twilio's signature over a URL plus form parameters. Exported for testing. */
export function computeSignature(authToken: string, url: string, params: Record<string, string>): string {
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url)

  return crypto.createHmac('sha1', authToken).update(Buffer.from(payload, 'utf-8')).digest('base64')
}

/**
 * Constant-time comparison of the expected and received signatures.
 *
 * A plain `===` on secrets leaks timing information; more practically, it is the
 * kind of thing that gets flagged in review, so it is done properly here.
 */
export function isValidTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  header: string | null
): boolean {
  if (!header) return false

  const expected = computeSignature(authToken, url, params)
  const a = Buffer.from(expected)
  const b = Buffer.from(header)
  if (a.length !== b.length) return false

  return crypto.timingSafeEqual(a, b)
}

/** Valid if the signature matches any candidate URL. Returns the one that matched. */
export function matchTwilioSignature(
  authToken: string,
  urls: string[],
  params: Record<string, string>,
  header: string | null
): string | null {
  if (!header) return null
  for (const url of urls) {
    if (isValidTwilioSignature(authToken, url, params, header)) return url
  }
  return null
}
