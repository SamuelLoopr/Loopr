'use client'

import { useEffect, useRef, useState } from 'react'
import { FiAlertTriangle, FiCheck, FiClock, FiCopy, FiMessageSquare, FiMoon, FiPhone } from 'react-icons/fi'
import type { ClientStatus } from '@/lib/client-status'
import { CLIENT_STATUS_LABEL } from '@/lib/client-status'
import type { PublicSms } from '@/lib/public-calls'
import { toStockholm } from '@/lib/stockholm-time'
import { OFF_HOURS_LABEL, formatPhone, groupLabel, groupOf, type OffHours } from './logic'
import s from './bos.module.css'

// Små byggstenar som kort, panel och kalender delar, så att ett statusmärke
// eller ett telefonnummer ser likadant ut överallt på sidan.

export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ')
}

export function StatusBadge({ status }: { status: ClientStatus }) {
  const group = groupOf(status)
  // "Bokad" och "Avslutad" ligger båda under Klart; märket säger vilken.
  const label = group === 'klart' ? `Klart · ${CLIENT_STATUS_LABEL[status]}` : groupLabel(group)
  return (
    <span className={cx(s.badge, s.badgeStatus)} data-group={group}>
      {label}
    </span>
  )
}

export function OffHoursBadge({ kind }: { kind: OffHours }) {
  if (!kind) return null
  const { label, hint } = OFF_HOURS_LABEL[kind]
  return (
    <span className={cx(s.badge, s.badgeOff)} title={hint}>
      <FiMoon aria-hidden="true" size={11} />
      {label}
      <span className={s.srOnly}>, {hint.toLowerCase()}</span>
    </span>
  )
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Äldre webbläsare, eller sidan i en ram utan urklippsbehörighet.
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}

/**
 * Ett nummer stort, med kopiera och ring. `label` står ovanför ("Ring upp på");
 * `quiet` gör numret mindre, för det nummer som bara är där samtalet kom från
 * när kunden bett om att bli uppringd på ett annat.
 */
export function PhoneActions({
  number,
  big = false,
  label,
  quiet = false,
  onCopied,
}: {
  number: string
  big?: boolean
  label?: string
  quiet?: boolean
  onCopied?: (ok: boolean) => void
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const shown = formatPhone(number)
  const what = label ? `${label.toLowerCase()} ${shown}` : shown

  async function copy() {
    const ok = await copyText(number)
    onCopied?.(ok)
    if (!ok) return
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className={cx(s.phoneBlock, s.lift)}>
      {label && <span className={cx(s.phoneLabel, quiet && s.phoneLabelQuiet)}>{label}</span>}
      <div className={s.phoneRow}>
        <span className={cx(s.phone, big && !quiet && s.phoneBig, quiet && s.phoneQuiet)}>{shown}</span>
        <button
          type="button"
          className={cx(s.iconButton, copied && s.iconButtonDone)}
          onClick={copy}
          title={copied ? 'Kopierat' : 'Kopiera numret'}
          aria-label={copied ? `Numret ${shown} är kopierat` : `Kopiera numret, ${what}`}
        >
          {copied ? <FiCheck aria-hidden="true" size={15} /> : <FiCopy aria-hidden="true" size={15} />}
        </button>
        <a
          className={s.iconButton}
          href={`tel:${number.replace(/[^+\d]/g, '')}`}
          title="Ring upp"
          aria-label={`Ring, ${what}`}
        >
          <FiPhone aria-hidden="true" size={15} />
        </a>
      </div>
    </div>
  )
}

/**
 * Numren för ett ärende. Har kunden gett ett nummer att bli uppringd på står
 * det först, som "Ring upp på"; numret samtalet kom från står då under, mindre.
 * Finns inget av dem visas varningen.
 */
export function CallNumbers({ from, given, big = false }: { from?: string; given?: string; big?: boolean }) {
  if (!from && !given) return <MissingNumber />
  return (
    <>
      {given && <PhoneActions number={given} big={big} label="Ring upp på" />}
      {from && <PhoneActions number={from} big={big} label={given ? 'Ringde från' : undefined} quiet={Boolean(given)} />}
    </>
  )
}

/**
 * Tiden receptionisten lovade att kontoret ringer tillbaka (lib/callback-time.ts).
 * Har löftet passerats och ärendet fortfarande är nytt blir raden röd.
 */
export function PromisedCallback({ label, deadline, overdue = false }: { label: string; deadline?: string; overdue?: boolean }) {
  const passed = overdue && deadline ? toStockholm(deadline).time : null
  return (
    <p className={cx(s.promise, passed && s.promiseOverdue, s.lift)}>
      {passed
        ? <FiAlertTriangle aria-hidden="true" size={14} className={s.promiseIcon} />
        : <FiClock aria-hidden="true" size={14} className={s.promiseIcon} />}
      <span>
        <span className={s.promiseLabel}>Utlovad återuppringning:</span> {label}
        {passed && <strong className={s.promiseOverdueText}> · Löftet passerade {passed}</strong>}
      </span>
    </p>
  )
}

/** Har löftet passerats medan ärendet fortfarande är nytt? */
export function promiseOverdue(call: { promisedCallbackDeadline?: string; status: string }, now: number = Date.now()): boolean {
  return Boolean(call.promisedCallbackDeadline) && call.status === 'ny' && now > new Date(call.promisedCallbackDeadline!).getTime()
}

/**
 * Sms-bekräftelsen efter samtalet (lib/call-sms.ts) och antalet svar på den.
 * `compact` på korten: bara svaren, eftersom de är det kontoret måste läsa.
 */
export function SmsLine({ sms, compact = false }: { sms: PublicSms; compact?: boolean }) {
  const replies = sms.replies.length
  if (compact && replies === 0) return null
  const sent = sms.sentAt ? toStockholm(sms.sentAt) : null
  return (
    <p className={cx(s.smsLine, sms.failed && !compact && s.smsFailed, s.lift)}>
      <FiMessageSquare aria-hidden="true" size={13} />
      {!compact && (sent
        ? <span>Sms med tiden skickat {sent.time}</span>
        : sms.failed ? <span>Sms:et kunde inte skickas</span> : null)}
      {replies > 0 && <strong className={s.smsReplies}>{replies === 1 ? '1 sms-svar' : `${replies} sms-svar`}</strong>}
    </p>
  )
}

export function MissingNumber() {
  return (
    <p className={cx(s.warning, s.lift)}>
      <FiAlertTriangle aria-hidden="true" size={14} />
      Nummer saknas
    </p>
  )
}

export function EmptyState({
  icon,
  title,
  text,
  children,
}: {
  icon: React.ReactNode
  title: string
  text: string
  children?: React.ReactNode
}) {
  return (
    <div className={s.empty}>
      <div className={s.emptyIcon} aria-hidden="true">{icon}</div>
      <h2 className={s.emptyTitle}>{title}</h2>
      <p className={s.emptyText}>{text}</p>
      {children && <div className={s.emptyActions}>{children}</div>}
    </div>
  )
}

export function Skeleton({ height, width = '100%', style }: { height: number; width?: number | string; style?: React.CSSProperties }) {
  return <div className={s.skeleton} style={{ height, width, ...style }} aria-hidden="true" />
}
