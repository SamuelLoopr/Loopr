// Sms genom 46elks (POST https://api.46elks.com/a1/sms).
//
// Serveronly: läser ELKS_API_USERNAME och ELKS_API_PASSWORD.
//
//   - dontlog=message: 46elks sparar inte texten i sin historik. Den bär
//     kundens förnamn och behövs inte där — numret, tiden och kostnaden räcker
//     för att spåra ett utskick.
//   - dryrun: 46elks kontrollerar anropet och svarar med uppskattad kostnad,
//     men inget sms skickas.
//   - SMS_ALLOWED_RECIPIENTS: när den är satt går sms bara till numren i
//     listan (kommaseparerad, E.164), och "none" stoppar allt. Till för
//     testperioder; i vanlig drift är den inte satt.

const ENDPOINT = 'https://api.46elks.com/a1/sms'
const TIMEOUT_MS = 10_000

export interface SmsMessage {
  /** Avsändaren: ett nummer i E.164 eller ett textnamn på högst 11 tecken. */
  from: string
  /** Mottagaren i E.164. */
  to: string
  message: string
}

export type SmsResult =
  | { status: 'sent'; id: string; parts: number | null; cost: number | null }
  | { status: 'dryrun'; parts: number | null; estimatedCost: number | null }
  | { status: 'blocked'; reason: string }
  | { status: 'failed'; error: string }

export type SmsTransport = (message: SmsMessage, opts: { dryrun: boolean }) => Promise<SmsResult>

let override: SmsTransport | null = null

/**
 * Byter ut 46elks mot en egen funktion — för tester, där sms:et ska fångas
 * innan det lämnar servern. null återställer.
 */
export function setSmsTransportForTests(transport: SmsTransport | null): void {
  override = transport
}

/** Nummer i ett felmeddelande byts ut: felet sparas i databasen och loggas. */
export function scrubNumbers(text: string): string {
  return text.replace(/\+?\d[\d\s-]{5,}\d/g, '[nummer]').slice(0, 300)
}

function allowed(to: string): { ok: true } | { ok: false; reason: string } {
  const list = process.env.SMS_ALLOWED_RECIPIENTS?.trim()
  if (!list) return { ok: true }
  if (list === 'none') return { ok: false, reason: 'SMS_ALLOWED_RECIPIENTS=none stoppar alla sms' }
  const numbers = list.split(',').map(n => n.trim())
  return numbers.includes(to) ? { ok: true } : { ok: false, reason: 'mottagaren finns inte i SMS_ALLOWED_RECIPIENTS' }
}

export async function sendSms(message: SmsMessage, { dryrun = false }: { dryrun?: boolean } = {}): Promise<SmsResult> {
  const gate = allowed(message.to)
  if (!gate.ok) return { status: 'blocked', reason: gate.reason }

  if (override) return override(message, { dryrun })
  return elks(message, { dryrun })
}

async function elks(message: SmsMessage, { dryrun }: { dryrun: boolean }): Promise<SmsResult> {
  const user = process.env.ELKS_API_USERNAME?.trim()
  const pass = process.env.ELKS_API_PASSWORD?.trim()
  if (!user || !pass) return { status: 'blocked', reason: 'ELKS_API_USERNAME eller ELKS_API_PASSWORD saknas' }

  const body = new URLSearchParams({
    from: message.from,
    to: message.to,
    message: message.message,
    dontlog: 'message',
    ...(dryrun ? { dryrun: 'yes' } : {}),
  })

  let res: Response
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    // Ett avbrott här betyder inte att sms:et uteblev — 46elks kan ha tagit
    // emot det innan svaret tappades. Därför försöker anroparen inte igen.
    return { status: 'failed', error: `Nätverksfel mot 46elks: ${scrubNumbers(err instanceof Error ? err.message : String(err))}` }
  }

  const text = await res.text().catch(() => '')
  if (!res.ok) return { status: 'failed', error: `46elks ${res.status}: ${scrubNumbers(text.trim() || res.statusText)}` }

  let data: Record<string, unknown>
  try {
    data = JSON.parse(text) as Record<string, unknown>
  } catch {
    return { status: 'failed', error: '46elks svarade 200 men inte med JSON' }
  }

  const parts = typeof data.parts === 'number' ? data.parts : null
  if (dryrun) {
    return { status: 'dryrun', parts, estimatedCost: typeof data.estimated_cost === 'number' ? data.estimated_cost : null }
  }
  if (data.status === 'failed') return { status: 'failed', error: '46elks markerade sms:et som misslyckat' }
  if (typeof data.id !== 'string') return { status: 'failed', error: '46elks svar saknar id' }
  return { status: 'sent', id: data.id, parts, cost: typeof data.cost === 'number' ? data.cost : null }
}
