// Utgående e-post, via Resend.
//
// Rå fetch mot REST-API:t i stället för Resends SDK, av samma skäl som
// Anthropic, ElevenLabs och Twilio anropas rakt i den här kodbasen: ett anrop,
// inget nytt beroende att hålla uppdaterat.
//
// Serveronly — den läser RESEND_API_KEY. Anropa aldrig härifrån klientkod.
//
// Saknas nyckeln eller avsändaren skickas ingenting och funktionen säger
// 'not_configured' i stället för att kasta. Det gör att notiserna kan byggas
// och testas innan domänen är verifierad, utan att resten går sönder.

export type SendResult =
  | { status: 'sent'; id: string }
  | { status: 'not_configured'; reason: string }
  | { status: 'failed'; error: string }

export interface EmailMessage {
  to: string
  subject: string
  /** Båda varianterna skickas alltid: text är det som syns i notisen på en klocka. */
  html: string
  text: string
  /** Svarar klienten på notisen hamnar svaret här. */
  replyTo?: string
}

const ENDPOINT = 'https://api.resend.com/emails'
const TIMEOUT_MS = 10_000

/**
 * Avsändaren. Måste vara en adress på en domän som är verifierad i Resend —
 * annars svarar Resend 403 och inget går ut. Format: "Loopr <notiser@loopr.se>"
 * eller bara "notiser@loopr.se".
 */
const from = () => process.env.EMAIL_FROM?.trim()

/**
 * Går det att skicka alls? Anropas innan ett utskick förbereds, så att arbete
 * (och databasskrivningar) inte görs i onödan när leverantören inte är
 * inkopplad än.
 */
export function isEmailConfigured(): { ok: true } | { ok: false; reason: string } {
  if (!process.env.RESEND_API_KEY) return { ok: false, reason: 'RESEND_API_KEY saknas i servermiljön' }
  if (!from()) return { ok: false, reason: 'EMAIL_FROM saknas i servermiljön' }
  return { ok: true }
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  const sender = from()

  if (!apiKey) return { status: 'not_configured', reason: 'RESEND_API_KEY saknas i servermiljön' }
  if (!sender) return { status: 'not_configured', reason: 'EMAIL_FROM saknas i servermiljön' }

  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: sender,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    // Timeout eller nätverksfel — anroparen får försöka igen senare.
    return { status: 'failed', error: err instanceof Error ? err.message : String(err) }
  }

  const body = (await res.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null

  if (!res.ok) {
    // Resends felkropp är { name, message }. Loggas av anroparen; adressen
    // tas inte med här eftersom den är kundens uppgift.
    return { status: 'failed', error: `Resend svarade ${res.status}: ${body?.message ?? body?.name ?? 'okänt fel'}` }
  }
  if (!body?.id) return { status: 'failed', error: 'Resend svarade utan id' }

  return { status: 'sent', id: body.id }
}

// ── Adressvalidering ────────────────────────────────────────────────────────
// Medvetet tillåtande: exakt RFC 5322 är inte värt komplexiteten, och en adress
// som ser rimlig ut men inte finns går ändå inte att skilja ut utan att skicka.
// Det här fångar det som faktiskt skrivs fel — mellanslag, saknad snabel,
// saknad punkt i domänen — och matchar CHECK-villkoret i migration 030.
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
export const EMAIL_MAX = 254

export type ParsedEmail = { ok: true; value: string | null } | { ok: false; error: string }

/**
 * Adressen som den ska sparas — eller ett fel på svenska. Tom sträng och null
 * betyder båda "stäng av notiserna" och ger { ok: true, value: null }.
 */
export function parseEmailAddress(raw: unknown): ParsedEmail {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, error: 'E-postadressen måste vara text.' }

  const value = raw.trim()
  if (!value) return { ok: true, value: null }
  if (value.length > EMAIL_MAX) return { ok: false, error: `E-postadressen får vara högst ${EMAIL_MAX} tecken.` }
  if (!EMAIL.test(value)) return { ok: false, error: 'Det där ser inte ut som en e-postadress.' }

  return { ok: true, value }
}
