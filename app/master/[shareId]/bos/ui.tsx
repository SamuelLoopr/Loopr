'use client'

import { useEffect, useRef, useState } from 'react'
import { FiAlertTriangle, FiCheck, FiCopy, FiMoon, FiPhone } from 'react-icons/fi'
import type { ClientStatus } from '@/lib/client-status'
import { CLIENT_STATUS_LABEL } from '@/lib/client-status'
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
 * Numret stort, med kopiera och ring. `number` är det ringbara numret
 * (callbackNumber); saknas det visas varningen i stället — se MissingNumber.
 */
export function PhoneActions({
  number,
  big = false,
  onCopied,
}: {
  number: string
  big?: boolean
  onCopied?: (ok: boolean) => void
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const shown = formatPhone(number)

  async function copy() {
    const ok = await copyText(number)
    onCopied?.(ok)
    if (!ok) return
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className={cx(s.phoneRow, s.lift)}>
      <span className={cx(s.phone, big && s.phoneBig)}>{shown}</span>
      <button
        type="button"
        className={cx(s.iconButton, copied && s.iconButtonDone)}
        onClick={copy}
        title={copied ? 'Kopierat' : 'Kopiera numret'}
        aria-label={copied ? `Numret ${shown} är kopierat` : `Kopiera numret ${shown}`}
      >
        {copied ? <FiCheck aria-hidden="true" size={15} /> : <FiCopy aria-hidden="true" size={15} />}
      </button>
      <a
        className={s.iconButton}
        href={`tel:${number.replace(/[^+\d]/g, '')}`}
        title="Ring upp"
        aria-label={`Ring ${shown}`}
      >
        <FiPhone aria-hidden="true" size={15} />
      </a>
    </div>
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
