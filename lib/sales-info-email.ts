import { isEmailConfigured, sendEmail, type SendResult } from '@/lib/email'

// Mejlet med prislista och video som säljlinjens assistent skickar när den som
// ringer bett om det (verktyget skicka_info). Innehållet är kunskapsbasen i
// agentens prompt och inget annat — samma siffror på båda ställena.
//
// Länkarna fylls i av operatören. Så länge de är platshållare skickas
// ingenting: ett mejl med "[YOUTUBE-LÄNK]" i är sämre än inget mejl, och
// verktyget säger då till agenten att Samuel mejlar i stället.

const VIDEO_URL = '[YOUTUBE-LÄNK]'
const BOOKING_URL = '[CAL.COM-LÄNK]'

const CONTACT_NAME = 'Samuel Hallson'
const CONTACT_EMAIL = 'samuel@tryloopr.se'
const CONTACT_PHONE = '070-256 06 22'

const PACKAGES = [
  'Start: 795 kr/mån, högst 80 minuter samtal.',
  'Standard: 1 395 kr/mån, 200 minuter, därefter 10 kr/min.',
  'Plus: 2 995 kr/mån, 500 minuter, därefter 10 kr/min.',
  'Startavgift 2 495 kr. Bindningstid 12 månader. Tre ändringar per månad ingår.',
]

const placeholder = (s: string) => /^\[.*\]$/.test(s.trim())

/** Går mejlet att skicka alls? Länkarna måste vara ifyllda och Resend inställt. */
export function infoEmailConfigured(): { ok: true } | { ok: false; reason: string } {
  if (placeholder(VIDEO_URL) || placeholder(BOOKING_URL)) return { ok: false, reason: 'länkarna i lib/sales-info-email.ts är inte ifyllda' }
  return isEmailConfigured()
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function buildInfoEmail(input: { firstName: string | null; company: string | null }): { subject: string; text: string; html: string } {
  const hello = input.firstName ? `Hej ${input.firstName},` : 'Hej,'
  const who = input.company ? input.company : 'ert företag'

  const text = [
    hello,
    '',
    'tack för samtalet med Looprs assistent. Här är prislistan och videon du bad om.',
    '',
    `Loopr Voice svarar i telefon åt ${who} när ingen annan kan, tar emot ärendet och lovar att ni ringer tillbaka. Ni får ett mejl med ärendet direkt och ser allt i en översikt.`,
    '',
    'Paket (exklusive moms)',
    ...PACKAGES,
    '',
    `Video: ${VIDEO_URL}`,
    `Boka 15 minuter med Samuel: ${BOOKING_URL}`,
    '',
    `${CONTACT_NAME}, Loopr`,
    `${CONTACT_EMAIL} · ${CONTACT_PHONE}`,
    '',
    'Du får det här mejlet för att du bad om det i samtalet.',
  ].join('\n')

  const html = `<!doctype html><html lang="sv"><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px">
<p>${esc(hello)}</p>
<p>tack för samtalet med Looprs assistent. Här är prislistan och videon du bad om.</p>
<p>Loopr Voice svarar i telefon åt ${esc(who)} när ingen annan kan, tar emot ärendet och lovar att ni ringer tillbaka. Ni får ett mejl med ärendet direkt och ser allt i en översikt.</p>
<p><strong>Paket (exklusive moms)</strong><br>${PACKAGES.map(esc).join('<br>')}</p>
<p>Video: <a href="${esc(VIDEO_URL)}">${esc(VIDEO_URL)}</a><br>Boka 15 minuter med Samuel: <a href="${esc(BOOKING_URL)}">${esc(BOOKING_URL)}</a></p>
<p>${esc(CONTACT_NAME)}, Loopr<br>${esc(CONTACT_EMAIL)} · ${esc(CONTACT_PHONE)}</p>
<p style="color:#6b6b6b;font-size:13px">Du får det här mejlet för att du bad om det i samtalet.</p>
</body></html>`

  return { subject: 'Loopr Voice: prislista och video', text, html }
}

export async function sendInfoEmail(to: string, input: { firstName: string | null; company: string | null }): Promise<SendResult> {
  const configured = infoEmailConfigured()
  if (!configured.ok) return { status: 'not_configured', reason: configured.reason }
  return sendEmail({ to, replyTo: CONTACT_EMAIL, ...buildInfoEmail(input) })
}
