// E.164 handling for phone numbers attached to an agent.
//
// Numbers bought through the Twilio flow arrive already in E.164 and carry a
// real Twilio SID. A number added by hand — one you already own, bought outside
// the app, or on a trial account — has neither, so it needs normalising here and
// a stand-in SID.
//
// phone_numbers.twilio_sid is `text not null unique` (013_ai_agent_telephony.sql),
// so a manual row cannot simply leave it empty. It gets `manual:<e164>` instead:
// non-null, unique per number, and obvious at a glance in the table. That avoids
// a schema migration, and isManualNumber() is what stops the release flow from
// asking Twilio to delete a number it never sold us.

const MANUAL_SID_PREFIX = 'manual:'

/** Stand-in SID for a number that did not come from the Twilio purchase flow. */
export function manualSidFor(e164: string): string {
  return `${MANUAL_SID_PREFIX}${e164}`
}

export function isManualNumber(twilioSid: string | null | undefined): boolean {
  return typeof twilioSid === 'string' && twilioSid.startsWith(MANUAL_SID_PREFIX)
}

export type NormalizeResult =
  | { ok: true; e164: string }
  | { ok: false; error: string }

/**
 * Accepts the ways a person actually types a number — spaces, hyphens, brackets,
 * a 00 international prefix — and returns strict E.164, or an explanation.
 *
 * A national-format number (starting 0, no country code) is rejected rather than
 * guessed at: the same digits mean different subscribers in different countries,
 * and guessing wrong would route real calls to the wrong agent.
 */
export function normalizeE164(raw: string): NormalizeResult {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (!trimmed) return { ok: false, error: 'Ange ett telefonnummer.' }

  // "(0)" after a country code is the national trunk prefix, written to show
  // what you would dial domestically — it is not part of the international
  // number. Drop it before stripping brackets, or "+46 (0)70…" would normalise
  // to +460701234567, a different (and invalid) number.
  let cleaned = trimmed.replace(/\(\s*0\s*\)/g, '')
  cleaned = cleaned.replace(/[\s\-(). ]/g, '')

  // 00 is the international prefix in most of Europe; treat it as +.
  if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2)

  if (!cleaned.startsWith('+')) {
    if (/^0\d+$/.test(cleaned)) {
      return {
        ok: false,
        error: 'Numret saknar landskod. Skriv det i internationellt format, t.ex. +46701234567 i stället för 0701234567.',
      }
    }
    return { ok: false, error: 'Numret måste börja med landskod, t.ex. +4915888623971.' }
  }

  const digits = cleaned.slice(1)
  if (!/^\d+$/.test(digits)) {
    return { ok: false, error: 'Numret får bara innehålla siffror efter landskoden.' }
  }
  if (digits.startsWith('0')) {
    return { ok: false, error: 'Landskoden kan inte börja med 0.' }
  }
  // E.164 allows at most 15 digits; below ~8 is not a dialable international number.
  if (digits.length < 8) {
    return { ok: false, error: 'Numret ser för kort ut för att vara ett internationellt nummer.' }
  }
  if (digits.length > 15) {
    return { ok: false, error: 'Numret är längre än 15 siffror, vilket E.164 inte tillåter.' }
  }

  return { ok: true, e164: '+' + digits }
}
