import { dialableNumber } from '@/lib/public-calls'

// Mejlet som går till klienten när någon svarar på sms-bekräftelsen.
//
// Samma mottagare och samma utseende som samtalsnotisen
// (lib/call-notification.ts). Svaret är kundens egna ord och visas som de är —
// utom när det nämner något om hälsa: då står bara att svaret finns i BOS.
// Avgörs av anroparen med samma hälsofilter som samtalsanalysen.
//
// Fri från imports av servergrejer så den kan enhetstestas med vanliga `node`.

export interface SmsReplyNotification {
  businessName: string
  /** Avsändarens nummer, E.164. */
  fromNumber: string
  /** Namnet från samtalet svaret kopplades till, om det finns. */
  callerName: string | null
  message: string
  /** Svaret nämner hälsa och visas därför bara i BOS. */
  hideMessage: boolean
  receivedAt: string
  /** Starttiden för samtalet svaret kopplades till, eller null. */
  callStartedAt: string | null
  /** Absolut länk till ärendet i BOS (eller sidan, om inget samtal hittades). */
  url: string
}

const WHEN = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
})

function formatWhen(iso: string): string {
  const p = Object.fromEntries(WHEN.formatToParts(new Date(iso)).map(x => [x.type, x.value]))
  return `${p.weekday} ${p.day} ${p.month} ${p.hour}:${p.minute}`
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export const HIDDEN_REPLY_TEXT = 'Svaret kan innehålla känsliga uppgifter och visas bara i BOS.'

export function buildSmsReplyNotification(reply: SmsReplyNotification): { subject: string; html: string; text: string } {
  const number = dialableNumber(reply.fromNumber) ?? reply.fromNumber
  const who = reply.callerName ?? number
  const subject = `Sms-svar: ${who}`
  const body = reply.hideMessage ? HIDDEN_REPLY_TEXT : reply.message
  const context = reply.callStartedAt
    ? `Svar på sms:et efter samtalet ${formatWhen(reply.callStartedAt)}.`
    : 'Inget samtal från numret hittades de senaste 30 dagarna.'

  const text = [
    `${reply.businessName} — sms-svar`,
    formatWhen(reply.receivedAt),
    '',
    ...(reply.callerName ? [`Namn: ${reply.callerName}`] : []),
    `Telefon: ${number}`,
    '',
    body,
    '',
    context,
    `Öppna ärendet: ${reply.url}`,
  ].join('\n')

  const html = `<!doctype html>
<html lang="sv">
<body style="margin:0;padding:24px 12px;background:#f4f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#151313;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e1ee;">
    <tr>
      <td style="padding:20px 24px;border-bottom:1px solid #eeeaf4;">
        <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#7C3AED;">
          ${esc(reply.businessName)}
        </p>
        <p style="margin:4px 0 0;font-size:18px;font-weight:700;">Sms-svar</p>
        <p style="margin:2px 0 0;font-size:13px;color:#6b6676;">${esc(formatWhen(reply.receivedAt))}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px 0;">
        ${reply.callerName ? `<p style="margin:0 0 6px;font-size:17px;font-weight:700;">${esc(reply.callerName)}</p>` : ''}
        <p style="margin:0;font-size:16px;">
          <a href="tel:${esc(number)}" style="color:#7C3AED;text-decoration:none;font-weight:700;">${esc(number)}</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 24px 0;">
        <p style="margin:0;padding:12px 14px;border-radius:10px;background:#f3eefe;font-size:15px;line-height:1.5;white-space:pre-wrap;${reply.hideMessage ? 'color:#6b6676;font-style:italic;' : ''}">${esc(body)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:12px 24px 0;">
        <p style="margin:0;font-size:13.5px;color:#6b6676;">${esc(context)}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:22px 24px 26px;">
        <a href="${esc(reply.url)}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#7C3AED;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">
          Öppna ärendet
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

  return { subject, html, text }
}
