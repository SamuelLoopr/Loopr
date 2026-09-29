// Masking and redaction for call data shown on the public share pages.
//
// The public Master Demo / BOS link (/master/[shareId]) has no login: anyone
// holding the link can open it, and links get forwarded. So the callers on it —
// private individuals who rang a business, not the business itself — get their
// directly contactable identifiers hidden:
//
//   maskPhone()   the number they called from, e.g. "+46 70 ••• •• 22"
//   redactPii()   phone numbers, e-mail addresses and personnummer inside free
//                 text (transcripts, summaries)
//
// redactPii() is pattern-based and therefore best-effort. It catches what the
// speech recogniser writes as digits; a number read out as words ("noll sju
// noll…") or a name and street address are left as they are. The logged-in
// dashboard still shows everything in full.
//
// Deliberately free of imports so it can be unit-tested with plain `node`.

const BULLET = '•'

/** The caller's number with the middle hidden, or a neutral label when there is none. */
export function maskPhone(raw: string | null | undefined): string {
  const cleaned = (raw ?? '').replace(/[^\d+]/g, '')
  const digits = cleaned.replace(/\D/g, '')

  // Twilio reports withheld numbers as "anonymous", "restricted" or a short
  // placeholder; none of them is a real subscriber number worth showing.
  if (digits.length < 7) return 'Dolt nummer'

  const last2 = digits.slice(-2)

  if (cleaned.startsWith('+46') || cleaned.startsWith('0046')) {
    const national = digits.slice(cleaned.startsWith('+46') ? 2 : 4)
    const prefix = national.slice(0, 2)
    const hidden = Math.max(national.length - 4, 1)
    return `+46 ${prefix} ${groupBullets(hidden)} ${last2}`
  }

  if (cleaned.startsWith('0')) {
    // National format, e.g. from a webhook that did not send E.164.
    const prefix = digits.slice(0, 3)
    const hidden = Math.max(digits.length - 5, 1)
    return `${prefix}-${groupBullets(hidden)} ${last2}`
  }

  // Any other country: the country code cannot be split off reliably without a
  // numbering-plan table, so keep only the first two and the last two digits.
  const hidden = Math.max(digits.length - 4, 1)
  return `+${digits.slice(0, 2)} ${BULLET.repeat(hidden)} ${last2}`
}

/** "•••••" -> "••• ••", matching how Swedish numbers are grouped when spoken. */
function groupBullets(count: number): string {
  if (count <= 3) return BULLET.repeat(count)
  return `${BULLET.repeat(count - 2)} ${BULLET.repeat(2)}`
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

// Swedish personnummer / samordningsnummer: YYMMDD-NNNN, YYYYMMDD-NNNN (the +
// separator marks someone over 100), or twelve digits run together.
const PERSONNUMMER = /\b(?:19|20)?\d{6}[-+]\d{4}\b|\b(?:19|20)\d{10}\b/g

// A run of digits broken up only by the separators people use in phone numbers
// — spaces, hyphens, brackets — with an optional + or 00 in front. Dots and
// slashes are left out on purpose: they would glue "25 000. 12 000" or a date
// into one long run. Whether a run is a phone number is decided in redactPii().
const DIGIT_RUN = /(?:\+|\b00)?\(?\d[\d\s\-()]{4,}\d/g

// "1 500 000" or "20 000-30 000": thousands grouping, i.e. an amount or a price
// range. A dialled number never looks like this unless it starts with 0 or +,
// which is checked first.
const AMOUNT = /^\d{1,3}(?: \d{3})+(?: ?- ?\d{1,3}(?: \d{3})+)?$/

/**
 * Hides phone numbers, e-mail addresses and personnummer in free text.
 *
 * A digit run counts as a phone number when it starts the way a dialled number
 * does (0, 00 or +) and has 7–15 digits, or otherwise has 8–15 digits and is not
 * written as an amount. Prices, measurements, years and postcodes stay intact;
 * the occasional eight-digit order number gets hidden too — the safe direction
 * to err in on a page anyone with the link can open.
 */
export function redactPii(text: string | null | undefined): string {
  if (!text) return ''

  return text
    .replace(EMAIL, '[e-post]')
    .replace(PERSONNUMMER, '[personnummer]')
    .replace(DIGIT_RUN, (match) => {
      const digitCount = match.replace(/\D/g, '').length
      if (digitCount > 15) return match

      const dialled = /^\(?(?:\+|0)/.test(match)
      if (dialled) return digitCount >= 7 ? '[telefonnummer]' : match

      return digitCount >= 8 && !AMOUNT.test(match.trim()) ? '[telefonnummer]' : match
    })
}
