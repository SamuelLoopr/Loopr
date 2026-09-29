'use client'

import { useId, useState } from 'react'
import { fromStockholm } from '@/lib/stockholm-time'
import { BOOKING_NAME_MAX, BOOKING_NOTE_MAX, BOOKING_TITLE_MAX } from '@/lib/booking-rules'

// Create or edit one booking — used by "Boka in" on a call card and by the
// calendar itself. Day and time are Swedish wall-clock time whatever the
// device's time zone (lib/stockholm-time.ts); the server checks everything
// again (lib/booking-rules.ts), this only catches the obvious early.

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
    <form onSubmit={submit} style={{
      marginTop: 12, padding: 14, borderRadius: 12,
      background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.25)',
    }}>
      {context && (
        <p style={{ margin: '0 0 10px', fontSize: 12.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.55)' }}>{context}</p>
      )}
      {basis && (
        <p style={{ margin: '0 0 10px', fontSize: 11.5, color: '#93c5fd' }}>
          {basis} — kontrollera dag och tid innan ni sparar.
        </p>
      )}

      <Field label="Titel" htmlFor={`${id}-title`}>
        <input id={`${id}-title`} value={draft.title} maxLength={BOOKING_TITLE_MAX}
          onChange={e => set('title', e.target.value)} style={input} required />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
        <Field label="Datum" htmlFor={`${id}-date`}>
          <input id={`${id}-date`} type="date" value={draft.date}
            onChange={e => set('date', e.target.value)} style={input} required />
        </Field>
        <Field label="Tid" htmlFor={`${id}-time`}>
          <input id={`${id}-time`} type="time" step={900} value={draft.time}
            onChange={e => set('time', e.target.value)} style={input} required />
        </Field>
        <Field label="Längd" htmlFor={`${id}-dur`}>
          <select id={`${id}-dur`} value={draft.durationMin}
            onChange={e => set('durationMin', Number(e.target.value))} style={input}>
            {durations.map(m => <option key={m} value={m} style={{ color: '#151313' }}>{durationLabel(m)}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Namn (valfritt)" htmlFor={`${id}-name`}>
        <input id={`${id}-name`} value={draft.callerName} maxLength={BOOKING_NAME_MAX}
          onChange={e => set('callerName', e.target.value)} style={input} placeholder="Vem bokningen gäller" />
      </Field>

      <Field label="Anteckning (valfritt)" htmlFor={`${id}-note`}>
        <textarea id={`${id}-note`} value={draft.note} maxLength={BOOKING_NOTE_MAX} rows={2}
          onChange={e => set('note', e.target.value)} style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }} />
      </Field>

      {markBookedOption && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>
          <input type="checkbox" checked={markBooked} onChange={e => setMarkBooked(e.target.checked)} />
          Sätt samtalet som ”Bokad”
        </label>
      )}

      <p style={{ margin: '8px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
        Syns för alla som har länken — skriv inte telefonnummer eller personnummer här.
      </p>

      {error && <p role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, color: '#f87171' }}>{error}</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' }}>
        <button type="submit" disabled={saving} style={{
          border: 'none', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700,
          cursor: saving ? 'wait' : 'pointer', color: 'white', background: '#3b82f6', opacity: saving ? 0.6 : 1,
        }}>
          {saving ? 'Sparar…' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} style={ghost}>Avbryt</button>

        {onDelete && (
          confirmDelete ? (
            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>
              Ta bort bokningen?
              <button type="button" onClick={doDelete} disabled={saving}
                style={{ ...ghost, color: '#f87171', borderColor: 'rgba(248,113,113,0.4)' }}>Ja, ta bort</button>
              <button type="button" onClick={() => setConfirmDelete(false)} disabled={saving} style={ghost}>Nej</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} disabled={saving}
              style={{ ...ghost, marginLeft: 'auto', color: '#f87171' }}>
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
    <div style={{ marginBottom: 10 }}>
      <label htmlFor={htmlFor} style={{
        display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 5,
      }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: 13.5, padding: '8px 10px', borderRadius: 9, outline: 'none',
  color: '#f6f3ee', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
  colorScheme: 'dark',
}

const ghost: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9,
  padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
}
