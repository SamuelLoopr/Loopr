// The one text format call_logs.transcript uses, and the parser for it.
//
// One line per turn, prefixed with who spoke:
//   ai: Hej! Du har nått Bentus AB. Hur kan jag hjälpa dig?
//   user: Jag vill bygga en pool.
//
// That is the format the dashboard's failed-test-call logging already writes
// (receptionist/[id]/page.tsx, logCallError), so rows from every source read the
// same. Rows posted to /api/webhooks/[token] can carry any free text; lines
// without a known prefix are kept rather than dropped.
//
// Deliberately free of imports so it can be unit-tested with plain `node`.

export type Speaker = 'caller' | 'receptionist' | 'unknown'

export interface Turn {
  speaker: Speaker
  text: string
}

const CALLER_PREFIX = /^(?:user|kund|caller)\s*:\s*/i
const RECEPTIONIST_PREFIX = /^(?:ai|agent|assistant|receptionist)\s*:\s*/i

/** Turns in call order -> the stored text. Newlines inside a turn become spaces. */
export function formatTranscript(turns: Turn[]): string {
  return turns
    .map(t => ({ ...t, text: t.text.replace(/\s*\n\s*/g, ' ').trim() }))
    .filter(t => t.text)
    .map(t => `${t.speaker === 'caller' ? 'user' : 'ai'}: ${t.text}`)
    .join('\n')
}

/** Stored text -> turns. A prefix-less line continues the turn before it. */
export function parseTranscript(text: string | null | undefined): Turn[] {
  const turns: Turn[] = []

  for (const rawLine of (text ?? '').split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    if (CALLER_PREFIX.test(line)) {
      turns.push({ speaker: 'caller', text: line.replace(CALLER_PREFIX, '') })
    } else if (RECEPTIONIST_PREFIX.test(line)) {
      turns.push({ speaker: 'receptionist', text: line.replace(RECEPTIONIST_PREFIX, '') })
    } else if (turns.length > 0) {
      turns[turns.length - 1].text += ` ${line}`
    } else {
      turns.push({ speaker: 'unknown', text: line })
    }
  }

  return turns.filter(t => t.text)
}

/** Did the caller say anything at all? A greeting and a hang-up is not a conversation. */
export function callerSpoke(turns: Turn[]): boolean {
  return turns.some(t => t.speaker !== 'receptionist')
}
