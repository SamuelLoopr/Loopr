import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { sendSms } from '@/lib/sms'

// Varningar till operatören (Loopr, inte kunden) när något i kedjan fallerar:
// ett samtal som misslyckas hos ElevenLabs, ett notismejl som inte går ut,
// eller morgonkontrollen (lib/health-check.ts) som hittar ett problem.
//
// Mottagarna sätts i miljön och är av när de saknas:
//   OPS_ALERT_EMAIL     adress för varningsmejlet
//   OPS_ALERT_SMS       nummer i E.164 för varnings-sms:et
//   OPS_ALERT_SMS_FROM  avsändare, standard "Loopr"
//
// Högst en varning per sort och timme: raden i ops_alerts (052) bokas först,
// och bara den körning som får in raden skickar. Elva misslyckade samtal i
// rad blir alltså ett sms, inte elva.
//
// Inga personuppgifter i texten — bara antal, kundens namn och de fyra sista
// siffrorna i ett nummer. Kastar aldrig; en varning som inte går ut får inte
// fälla det som varnade.

export type AlertKind = 'call_failed' | 'notify_failed' | 'morning' | 'long_call'

/**
 * Sms:et säger bara vad som hänt och hänvisar till mejlet. Utan å, ä och ö:
 * ett enda sådant tecken gör sms:et till UCS-2, där en del rymmer 70 tecken i
 * stället för 160 (varningen 10 november blev tre delar).
 */
const SMS_TEXT: Record<AlertKind, string> = {
  call_failed: 'Loopr: ett samtal kom inte fram. Se mejl.',
  notify_failed: 'Loopr: ett notismejl gick inte ut. Se mejl.',
  morning: 'Loopr: morgonkontrollen hittade problem. Se mejl.',
  long_call: 'Loopr: en linje har varit uppkopplad over 15 min. Se mejl.',
}

/** Bara GSM-tecken och högst en sms-del, vad som än skickas in. */
export function singleSms(text: string): string {
  const plain = text
    .replace(/[åä]/g, 'a').replace(/[ÅÄ]/g, 'A').replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 .,:;!?()\-+%\/]/g, '')
  return plain.slice(0, 160)
}

const TIME = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function bucket(now: Date): string {
  return now.toISOString().slice(0, 13)
}

export async function sendOpsAlert(
  supabase: SupabaseClient,
  kind: AlertKind,
  message: string,
  { now = new Date(), throttle = true, smsText }: { now?: Date; throttle?: boolean; smsText?: string } = {},
): Promise<'sent' | 'throttled' | 'off' | 'failed'> {
  try {
    const email = process.env.OPS_ALERT_EMAIL?.trim()
    const sms = process.env.OPS_ALERT_SMS?.trim()
    if (!email && !sms) return 'off'

    if (throttle) {
      const { data, error } = await supabase
        .from('ops_alerts')
        .upsert({ kind, bucket: bucket(now) }, { onConflict: 'kind,bucket', ignoreDuplicates: true })
        .select('kind')
      // Saknas tabellen (052 inte körd) skickas varningen ändå, utan spärr.
      if (!error && (!data || data.length === 0)) return 'throttled'
    }

    // Tiden står sist i mejlet, så det syns när kontrollen körde även om
    // mejlet kommer fram sent.
    const body = `${message}\n\nTid: ${TIME.format(now)}`
    const results = await Promise.allSettled([
      email ? sendEmail({ to: email, subject: `Loopr-varning: ${message.split('\n')[0]}`, text: body, html: `<pre style="font-family:inherit;white-space:pre-wrap;">${escapeHtml(body)}</pre>` }) : null,
      sms ? sendSms({ from: process.env.OPS_ALERT_SMS_FROM?.trim() || 'Loopr', to: sms, message: singleSms(smsText ?? SMS_TEXT[kind]) }) : null,
    ])
    const sent = results.some(r => r.status === 'fulfilled' && r.value && (r.value as { status: string }).status === 'sent')
    if (!sent) console.error(`[ops-alert] Varningen (${kind}) gick inte ut`)
    return sent ? 'sent' : 'failed'
  } catch (err) {
    console.error('[ops-alert] Kastade:', err)
    return 'failed'
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
