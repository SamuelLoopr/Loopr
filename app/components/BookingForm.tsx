'use client'

import { useId, useState } from 'react'
import { fromStockholm } from '@/lib/stockholm-time'
import { BOOKING_NAME_MAX, BOOKING_NOTE_MAX, BOOKING_TITLE_MAX } from '@/lib/booking-rules'
import s from '@/app/master/[shareId]/bos/bos.module.css'

// Create or edit one booking — used by "Boka in" in a case on the client's BOS
// page and by the calendar there. Day and time are Swedish wall-clock time
// whatever the device's time zone (lib/stockholm-time.ts); the server checks
// everything again (lib/booking-rules.ts), this only catches the obvious early.

export interface BookingDraft {
  title: string
  /** Stockholm day, 'YYYY-MM-DD'. */
  date: string
  /** 'HH:MM'. */
  time: string
  durationMin: number
  callerName: string
  note: string
}

export interface BookingValues {
  title: string
  startsAt: string
  endsAt: string
  callerName: string | null
  note: string | null
}

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720]

function durationLabel(min: number): string {
  if (min < 60) return `${min} min`
  const h = min / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')} h`
}

export default function BookingForm({
  initial,
  basis,
  context,
  submitLabel,
  markBookedOption = false,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial: BookingDraft
  /** Where a prefilled day/time came from — shown so the client knows it is a guess. */
  basis?: string | null
  /** A line of context above the fields, e.g. the call's summary. */
  context?: string | null
  submitLabel: string
  /** Offer to set the call's status to "Bokad" as part of the same save. */
  markBookedOption?: boolean
  onSubmit: (values: BookingValues, opts: { markBooked: boolean }) => Promise<string | null>
  onCancel: () => void
  onDelete?: () => Promise<string | null>
}) {
  const [draft, setDraft] = useState<BookingDraft>(initial)
  const [markBooked, setMarkBooked] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const id = useId()

  const set = <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) =>
    setDraft(prev => ({ ...prev, [key]: value }))

  const durations = DURATIONS.includes(draft.durationMin)
    ? DURATIONS
    : [...DURATIONS, draft.durationMin].sort((a, b) => a - b)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!draft.title.trim()) { setError('Skriv en titel.'); return }
    if (!draft.date || !draft.time) { setError('Välj datum och tid.'); return }

    const start = fromStockholm(draft.date, draft.time)
    const end = new Date(start.getTime() + draft.durationMin * 60_000)
    setSaving(true)
    setError('')
    const err = await onSubmit(
      {
        title: draft.title.trim(),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        callerName: draft.callerName.trim() || null,
        note: draft.note.trim() || null,
      },
      { markBooked: markBookedOption && markBooked },
    )
    setSaving(false)
    if (err) setError(err)
  }

  async function doDelete() {
    if (!onDelete) return
    setSaving(true)
    setError('')
    const err = await onDelete()
    setSaving(false)
    if (err) { setError(err); setConfirmDelete(false) }
  }

  return (
    <form onSubmit={submit} className={s.form}>
      {context && <p className={s.help} style={{ marginTop: 0, marginBottom: 10 }}>{context}</p>}
      {basis && <p className={s.basis}>{basis} — kontrollera dag och tid innan ni sparar.</p>}

      <Field label="Titel" htmlFor={`${id}-title`}>
        <input id={`${id}-title`} className={s.input} value={draft.title} maxLength={BOOKING_TITLE_MAX}
          onChange={e => set('title', e.target.value)} required />
      </Field>

      <div className={s.formGrid}>
        <Field label="Datum" htmlFor={`${id}-date`}>
          <input id={`${id}-date`} className={s.input} type="date" value={draft.date}
            onChange={e => set('date', e.target.value)} required />
        </Field>
        <Field label="Tid" htmlFor={`${id}-time`}>
          <input id={`${id}-time`} className={s.input} type="time" step={900} value={draft.time}
            onChange={e => set('time', e.target.value)} required />
        </Field>
        <Field label="Längd" htmlFor={`${id}-dur`}>
          <select id={`${id}-dur`} className={s.select} style={{ width: '100%', height: 38 }} value={draft.durationMin}
            onChange={e => set('durationMin', Number(e.target.value))}>
            {durations.map(m => <option key={m} value={m}>{durationLabel(m)}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Namn (valfritt)" htmlFor={`${id}-name`}>
        <input id={`${id}-name`} className={s.input} value={draft.callerName} maxLength={BOOKING_NAME_MAX}
          onChange={e => set('callerName', e.target.value)} placeholder="Vem bokningen gäller" />
      </Field>

      <Field label="Anteckning (valfritt)" htmlFor={`${id}-note`}>
        <textarea id={`${id}-note`} className={s.textarea} style={{ minHeight: 64 }} value={draft.note}
          maxLength={BOOKING_NOTE_MAX} rows={2} onChange={e => set('note', e.target.value)} />
      </Field>

      {markBookedOption && (
        <label className={s.checkboxRow}>
          <input type="checkbox" checked={markBooked} onChange={e => setMarkBooked(e.target.checked)} />
          Flytta ärendet till Klart (bokad)
        </label>
      )}

      <p className={s.help}>Syns för alla som har länken. Skriv inte personnummer här.</p>

      {error && <p role="alert" className={s.error}>{error}</p>}

      <div className={s.rowActions}>
        <button type="submit" disabled={saving} className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`}>
          {saving ? 'Sparar…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}>Avbryt</button>

        {onDelete && (
          confirmDelete ? (
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13.5 }}>
              Ta bort bokningen?
              <button type="button" onClick={doDelete} disabled={saving} className={`${s.btn} ${s.btnDanger} ${s.btnSm}`}>Ja, ta bort</button>
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={saving} className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}>Nej</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} disabled={saving}
              className={`${s.btn} ${s.btnDanger} ${s.btnSm}`} style={{ marginLeft: 'auto' }}>
              Ta bort
            </button>
          )
        )}
      </div>
    </form>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className={s.field}>
      <label htmlFor={htmlFor} className={s.label}>{label}</label>
      {children}
    </div>
  )
}
