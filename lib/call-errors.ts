// Turns whatever the ElevenLabs voice SDK throws into something a person can read.
//
// The SDK rejects startSession() — and calls onError() — with the raw DOM
// CloseEvent when the conversation WebSocket is closed by the server. Both call
// sites used to do `err instanceof Error ? err.message : String(err)`, and
// String(closeEvent) is "[object CloseEvent]", so every server-side refusal
// reached the user (and call_logs) as that one meaningless string. The close
// code and reason carry the actual explanation.
//
// Verified against the live ElevenLabs account: a conversation on an exhausted
// quota opens the socket, then closes with
//   code 3000, reason "[quota_exceeded] You've run out of credits. Add credits
//   or upgrade your plan to start a new conversation."

/** Close codes worth naming. 1000/1005 are normal hang-ups, not failures. */
const CLOSE_CODE_TEXT: Record<number, string> = {
  1001: 'Anslutningen stängdes av servern.',
  1006: 'Anslutningen bröts oväntat. Kontrollera nätverket och försök igen.',
  1011: 'Ett serverfel avbröt samtalet. Försök igen.',
  1013: 'Tjänsten är överbelastad just nu. Försök igen om en stund.',
}

/** ElevenLabs prefixes its reason with a machine-readable tag, e.g. "[quota_exceeded] ...". */
const REASON_TAG_TEXT: Record<string, string> = {
  quota_exceeded:
    'ElevenLabs-kontots kvot är slut — samtalet kan inte startas förrän krediter fyllts på eller planen uppgraderats.',
  invalid_api_key: 'ElevenLabs-nyckeln avvisades. Kontrollera ELEVENLABS_API_KEY.',
  agent_not_found: 'ElevenLabs-agenten hittades inte. Kontrollera ELEVENLABS_AGENT_ID.',
  unauthorized: 'ElevenLabs nekade anslutningen (behörighet saknas).',
}

/** A CloseEvent, or anything close enough to one (the SDK is not consistent across versions). */
function asCloseEventLike(value: unknown): { code: number; reason: string } | null {
  if (!value || typeof value !== 'object') return null
  const v = value as { code?: unknown; reason?: unknown; type?: unknown }
  if (typeof v.code !== 'number') return null
  // `type` is "close"/"error" on a real event; accept a bare {code, reason} too.
  if (v.type !== undefined && v.type !== 'close' && v.type !== 'error') return null
  return { code: v.code, reason: typeof v.reason === 'string' ? v.reason : '' }
}

/**
 * Best-effort human-readable description of a failed voice call.
 * Never returns "[object …]".
 */
export function describeCallError(err: unknown): string {
  if (err === null || err === undefined) return 'Okänt fel vid uppkoppling. Försök igen.'

  // Microphone refusal comes through as a DOMException, and is by far the most
  // common cause — name it explicitly rather than leaking "Permission denied".
  if (err instanceof DOMException || err instanceof Error) {
    const name = (err as DOMException).name
    if (name === 'NotAllowedError' || name === 'SecurityError' || /permission|denied/i.test(err.message)) {
      return 'Mikrofonen blockerades. Tillåt mikrofonåtkomst i webbläsaren och försök igen.'
    }
    if (name === 'NotFoundError') {
      return 'Ingen mikrofon hittades. Anslut en mikrofon och försök igen.'
    }
  }

  const closed = asCloseEventLike(err)
  if (closed) {
    const { code, reason } = closed

    // "[tag] Human sentence." → prefer our own wording for known tags, and fall
    // back to the upstream sentence, which is usually already readable.
    const tagged = reason.match(/^\[([a-z_]+)\]\s*(.*)$/i)
    if (tagged) {
      const [, tag, rest] = tagged
      const known = REASON_TAG_TEXT[tag.toLowerCase()]
      if (known) return known
      if (rest.trim()) return rest.trim()
    }

    if (reason.trim()) return reason.trim()
    if (CLOSE_CODE_TEXT[code]) return CLOSE_CODE_TEXT[code]
    return `Anslutningen bröts (kod ${code}). Försök igen.`
  }

  if (err instanceof Error) return err.message || 'Okänt fel vid uppkoppling. Försök igen.'
  if (typeof err === 'string') return err.trim() || 'Okänt fel vid uppkoppling. Försök igen.'

  // Last resort: anything but "[object Object]".
  try {
    const json = JSON.stringify(err)
    if (json && json !== '{}') return json
  } catch {
    /* circular or otherwise unserialisable */
  }
  return 'Okänt fel vid uppkoppling. Försök igen.'
}

/**
 * The SDK's onError gives (message, context). `message` is usually a string but
 * is the CloseEvent in the failure cases we actually hit, so route both through
 * the same translator.
 */
export function describeSdkError(message: unknown, context?: unknown): string {
  const fromContext = context !== undefined ? asCloseEventLike(context) : null
  if (typeof message === 'string' && message.trim() && !message.startsWith('[object')) {
    // A real string message, but the context may still carry the close reason.
    if (fromContext) {
      const detail = describeCallError(context)
      return detail && detail !== message ? `${message} — ${detail}` : message
    }
    return message
  }
  return describeCallError(fromContext ? context : message)
}
