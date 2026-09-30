import { CONTACT_REQUEST_LABEL, type PublicContactRequest } from '@/lib/public-calls'

// Notisen som går till klienten när ett samtal är färdiganalyserat.
//
// Bygger ämne, HTML och textversion. Innehållet är klientens eget: hela
// telefonnumret, namnet om det sagts, sammanfattningen, vad den som ringde
// ville, och en länk rakt till samtalet i BOS.
//
// Numret maskeras INTE här. Notisen går bara till klientens egen inställda
// adress, och hela poängen är att de ska kunna ringa upp direkt. Det är samma
// gräns som på sidan i klientläge (lib/public-calls.ts).
//
// Fri från imports av servergrejer så den kan enhetstestas med vanliga `node`.

export interface CallNotification {
  callerName: string | null
  /** Hela numret, E.164. Null när Twilio inte fick något (dolt nummer). */
  fromNumber: string | null
  summary: string
  contactRequest: PublicContactRequest | null
  contactNote: string | null
  startedAt: string
  /** Absolut länk till samtalet i BOS. */
  url: string
  businessName: string
}

export interface BuiltEmail {
  subject: string
  html: string
  text: string
}

const WHEN = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
})

/** "måndag 28 september 19:50" i svensk tid, oavsett var servern står. */
function formatWhen(iso: string): string {
  const p = Object.fromEntries(WHEN.formatToParts(new Date(iso)).map(x => [x.type, x.value]))
  return `${p.weekday} ${p.day} ${p.month} ${p.hour}:${p.minute}`
}

/**
 * De fem tecken som kan bryta ut ur HTML-kontext. Sammanfattningen och namnet
 * kommer från en språkmodell som läst vad en främling sagt i telefon, så inget
 * av det får nå mejlet oescapat.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Vad den som ringde vill, som en rad: "Vill bli kontaktad — Offert". */
export function badgeText(request: PublicContactRequest | null): string | null {
  return request ? `Vill bli kontaktad — ${CONTACT_REQUEST_LABEL[request]}` : null
}

export function buildCallNotification(call: CallNotification): BuiltEmail {
  const who = call.callerName ?? call.fromNumber ?? 'Okänd uppringare'
  const badge = badgeText(call.contactRequest)
  const number = call.fromNumber ?? 'Dolt nummer'
  // tel: vill ha numret utan mellanslag; E.164 från Twilio är redan rent.
  const telHref = call.fromNumber?.replace(/[^+\d]/g, '') ?? null

  const subject = badge
    ? `${badge}: ${who}`
    : `Nytt samtal: ${who}`

  const textLines = [
    `${call.businessName} — nytt samtal`,
    formatWhen(call.startedAt),
    '',
    ...(badge ? [badge.toUpperCase(), ''] : []),
    ...(call.callerName ? [`Namn: ${call.callerName}`] : []),
    `Telefon: ${number}`,
    '',
    ...(call.contactNote ? [call.contactNote, ''] : []),
    call.summary,
    '',
    `Öppna samtalet: ${call.url}`,
  ]

  const html = `<!doctype html>
<html lang="sv">
<body style="margin:0;padding:24px 12px;background:#f4f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#151313;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e1ee;">
    <tr>
      <td style="padding:20px 24px;border-bottom:1px solid #eeeaf4;">
        <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#7C3AED;">
          ${esc(call.businessName)}
        </p>
        <p style="margin:4px 0 0;font-size:18px;font-weight:700;">Nytt samtal</p>
        <p style="margin:2px 0 0;font-size:13px;color:#6b6676;">${esc(formatWhen(call.startedAt))}</p>
      </td>
    </tr>
    ${badge ? `<tr>
      <td style="padding:16px 24px 0;">
        <span style="display:inline-block;padding:6px 12px;border-radius:20px;background:#A855F7;color:#ffffff;font-size:13px;font-weight:700;">
          ${esc(badge)}
        </span>
      </td>
    </tr>` : ''}
    <tr>
      <td style="padding:16px 24px 0;">
        ${call.callerName ? `<p style="margin:0 0 6px;font-size:17px;font-weight:700;">${esc(call.callerName)}</p>` : ''}
        <p style="margin:0;font-size:16px;">
          ${telHref
            ? `<a href="tel:${esc(telHref)}" style="color:#7C3AED;text-decoration:none;font-weight:700;">${esc(number)}</a>`
            : `<span style="color:#6b6676;">${esc(number)}</span>`}
        </p>
      </td>
    </tr>
    ${call.contactNote ? `<tr>
      <td style="padding:14px 24px 0;">
        <p style="margin:0;font-size:15px;font-weight:600;line-height:1.45;">${esc(call.contactNote)}</p>
      </td>
    </tr>` : ''}
    <tr>
      <td style="padding:12px 24px 0;">
        <p style="margin:0;font-size:14.5px;line-height:1.6;color:#413d4a;">${esc(call.summary)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:22px 24px 26px;">
        <a href="${esc(call.url)}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#7C3AED;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">
          Öppna samtalet
        </a>
      </td>
    </tr>
  </table>
  <p style="max-width:520px;margin:14px auto 0;font-size:11.5px;line-height:1.5;color:#8a8494;text-align:center;">
    Du får det här mejlet för att adressen är inställd för notiser på er Loopr-sida.
    Ändra eller stäng av under ”Ert konto”.
  </p>
</body>
</html>`

  return { subject, html, text: textLines.join('\n') }
}
