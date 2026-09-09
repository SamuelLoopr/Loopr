// Shared contact details and the booking CTA action, used by the public
// presentation pages (/om-loopr and /varfor-loopr) so the address and dialler
// behaviour live in exactly one place.

export const CONTACT_EMAIL = 'Samuel.hallson@gmail.com'

// The primary CTA should open the phone dialler. There is no number anywhere in
// the codebase or database to use (profile table is empty, no PHONE env var, no
// purchased Twilio numbers), so rather than ship a guessed or placeholder tel:
// link this stays empty and the button falls back to mailto. Fill in the real
// number in international format — e.g. '+46701234567' — and every CTA on both
// public pages switches to the dialler automatically; nothing else changes.
// (Typed as string rather than a null literal so TypeScript keeps the tel:
// branch reachable while the value is still empty.)
export const CONTACT_PHONE: string = ''

export const mailtoDemo = (subject: string) =>
  `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`

// tel: and mailto: are both external handoffs, never internal navigation — the
// pages' isolation rule still holds either way.
export const startBookingContact = (subject: string) => {
  window.location.href = CONTACT_PHONE
    ? `tel:${CONTACT_PHONE.replace(/[^+\d]/g, '')}`
    : mailtoDemo(subject)
}
