'use client'

import { useEffect, useMemo, useState } from 'react'
import BookingForm, { type BookingDraft } from '@/app/components/BookingForm'
import type { BookingsApi } from '@/app/components/useBookings'
import type { PublicBooking } from '@/lib/public-bookings'
import {
  addDays, formatBookingWhen, fromStockholm, startOfWeek, toStockholm, todayInStockholm,
} from '@/lib/stockholm-time'

// The client's own calendar on their BOS page (app/master/[shareId]): a month
// grid with the selected day's agenda underneath, where bookings are created,
// changed and removed. Days are Swedish days whatever the device's time zone.
//
// Month grid rather than a week of hour rows: the page is a single column that
// has to work on a phone, and a month grid collapses to dots there while the
// agenda carries the detail.

const WEEKDAYS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']
const MONTH_LABEL = new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const DAY_LABEL = new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })

/** A Stockholm day as a UTC Date, so the formatters above print that exact day. */
function asUtc(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
}

function draftFrom(b: PublicBooking): BookingDraft {
  const s = toStockholm(b.startsAt)
  return {
    title: b.title,
    date: s.date,
    time: s.time,
    durationMin: Math.round((new Date(b.endsAt).getTime() - new Date(b.startsAt).getTime()) / 60_000),
    callerName: b.callerName ?? '',
    note: b.note ?? '',
  }
}

type Editing = { kind: 'new' } | { kind: 'edit'; ref: string } | null

export default function BookingCalendar({
  api,
  focus,
  onShowCall,
}: {
  api: BookingsApi
  /** Jump to a day — e.g. from a call card's "Bokat" line. `n` makes repeats count. */
  focus: { date: string; n: number } | null
  onShowCall?: (callRef: string) => void
}) {
  const today = todayInStockholm()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selected, setSelected] = useState(today)
  const [editing, setEditing] = useState<Editing>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [editable, setEditable] = useState(false)

  const gridStart = startOfWeek(`${month}-01`)
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart])

  const { loadWindow } = api
  useEffect(() => {
    let cancelled = false
    loadWindow(fromStockholm(gridStart, '00:00'), fromStockholm(addDays(gridStart, 42), '00:00')).then(result => {
      if (cancelled) return
      if (!result) { setState(s => (s === 'ready' ? s : 'unavailable')); return }
      setEditable(result.editable)
      setState('ready')
    })
    return () => { cancelled = true }
  }, [gridStart, loadWindow])

  useEffect(() => {
    if (!focus) return
    setMonth(focus.date.slice(0, 7))
    setSelected(focus.date)
    setEditing(null)
  }, [focus])

  const byDay = useMemo(() => {
    const map = new Map<string, PublicBooking[]>()
    for (const b of api.bookings) {
      const day = toStockholm(b.startsAt).date
      const list = map.get(day) ?? []
      list.push(b)
      map.set(day, list)
    }
    return map
  }, [api.bookings])

  const now = Date.now()
  const nextUp = api.bookings.find(b => new Date(b.endsAt).getTime() > now)
  const dayList = byDay.get(selected) ?? []

  function show(date: string) {
    setMonth(date.slice(0, 7))
    setSelected(date)
  }

  if (state === 'unavailable') {
    return <p style={muted}>Kalendern kunde inte laddas just nu. Ladda om sidan om en stund.</p>
  }

  return (
    <div style={{
      borderRadius: 18, padding: 16,
      background: 'rgba(21,19,19,0.85)', border: '1px solid rgba(255,255,255,0.1)',
    }}>
      {/* ── Month navigation ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="Föregående månad" style={navButton}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f6f3ee' }}>
            {capitalize(MONTH_LABEL.format(asUtc(`${month}-01`)))}
          </p>
          {month !== today.slice(0, 7) && (
            <button type="button" onClick={() => show(today)} style={{ ...linkButton, fontSize: 11.5 }}>Till idag</button>
          )}
        </div>
        <button type="button" onClick={() => setMonth(m => shiftMonth(m, 1))} aria-label="Nästa månad" style={navButton}>›</button>
      </div>

      {nextUp && (
        <button type="button" onClick={() => show(toStockholm(nextUp.startsAt).date)} style={{
          ...linkButton, display: 'block', width: '100%', textAlign: 'center', marginBottom: 12,
          fontSize: 12.5, color: 'rgba(255,255,255,0.6)',
        }}>
          Nästa bokning: <span style={{ color: '#93c5fd', fontWeight: 600 }}>{formatBookingWhen(nextUp.startsAt)}</span> · {nextUp.title}
        </button>
      )}

      {/* ── Grid ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
        {WEEKDAYS.map(w => (
          <div key={w} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.4)', padding: '2px 0 6px' }}>
            {w}
          </div>
        ))}

        {days.map(day => {
          const inMonth = day.startsWith(month)
          const list = byDay.get(day) ?? []
          const isToday = day === today
          const isSelected = day === selected
          return (
            <button
              key={day}
              type="button"
              onClick={() => { setSelected(day); setEditing(null) }}
              aria-pressed={isSelected}
              aria-label={`${DAY_LABEL.format(asUtc(day))}${list.length ? `, ${list.length} ${list.length === 1 ? 'bokning' : 'bokningar'}` : ''}`}
              style={{
                minHeight: 62, padding: 4, borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, font: 'inherit',
                color: inMonth ? '#f6f3ee' : 'rgba(255,255,255,0.28)',
                background: isSelected ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isSelected ? 'rgba(96,165,250,0.55)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              <span style={{
                fontSize: 12, fontWeight: isToday ? 800 : 600, alignSelf: 'flex-start',
                minWidth: 20, height: 20, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: isToday ? 'var(--brick)' : 'transparent', color: isToday ? 'white' : undefined, padding: '0 4px',
              }}>
                {Number(day.slice(8))}
              </span>

              {/* Wide screens: the bookings themselves. */}
              <span className="hidden sm:flex" style={{ flexDirection: 'column', gap: 2, minWidth: 0, width: '100%' }}>
                {list.slice(0, 2).map(b => (
                  <span key={b.ref} style={{
                    fontSize: 10.5, lineHeight: 1.3, padding: '1px 4px', borderRadius: 4,
                    background: 'rgba(59,130,246,0.22)', color: '#dbeafe',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {toStockholm(b.startsAt).time} {b.title}
                  </span>
                ))}
                {list.length > 2 && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>+{list.length - 2} till</span>}
              </span>

              {/* Phones: a dot per booking, the agenda below has the detail. */}
              <span className="flex sm:hidden" style={{ gap: 3, flexWrap: 'wrap' }}>
                {list.slice(0, 3).map(b => (
                  <span key={b.ref} style={{ width: 6, height: 6, borderRadius: 3, background: '#60a5fa' }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── The selected day ───────────────────────────────────────────── */}
      <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f6f3ee' }}>
            {capitalize(DAY_LABEL.format(asUtc(selected)))}
          </h3>
          {editable && editing?.kind !== 'new' && (
            <button type="button" onClick={() => setEditing({ kind: 'new' })} style={primaryButton}>+ Ny bokning</button>
          )}
        </div>

        {editing?.kind === 'new' && (
          <BookingForm
            initial={{ title: '', date: selected, time: '09:00', durationMin: 60, callerName: '', note: '' }}
            submitLabel="Spara bokning"
            onCancel={() => setEditing(null)}
            onSubmit={async values => {
              const r = await api.create(values)
              if (r.error || !r.booking) return r.error ?? 'Bokningen kunde inte sparas.'
              setEditing(null)
              show(toStockholm(r.booking.startsAt).date)
              return null
            }}
          />
        )}

        {state === 'loading' && dayList.length === 0 ? (
          <p style={muted}>Laddar kalendern…</p>
        ) : dayList.length === 0 && editing?.kind !== 'new' ? (
          <p style={muted}>Inget bokat den här dagen.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dayList.map(b => (
              editing?.kind === 'edit' && editing.ref === b.ref ? (
                <li key={b.ref}>
                  <BookingForm
                    initial={draftFrom(b)}
                    submitLabel="Spara ändringar"
                    onCancel={() => setEditing(null)}
                    onSubmit={async values => {
                      const r = await api.update(b.ref, values)
                      if (r.error || !r.booking) return r.error ?? 'Bokningen kunde inte sparas.'
                      setEditing(null)
                      show(toStockholm(r.booking.startsAt).date)
                      return null
                    }}
                    onDelete={async () => {
                      const r = await api.remove(b.ref)
                      if (r.error) return r.error
                      setEditing(null)
                      return null
                    }}
                  />
                </li>
              ) : (
                <li key={b.ref} style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 12,
                  background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(96,165,250,0.25)',
                }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#93c5fd', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {toStockholm(b.startsAt).time}–{toStockholm(b.endsAt).time}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f6f3ee', lineHeight: 1.4 }}>{b.title}</p>
                    {b.callerName && <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'rgba(255,255,255,0.6)' }}>{b.callerName}</p>}
                    {b.note && (
                      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'rgba(255,255,255,0.55)', whiteSpace: 'pre-wrap' }}>{b.note}</p>
                    )}
                    {b.callRef && onShowCall && (
                      <button type="button" onClick={() => onShowCall(b.callRef!)} style={{ ...linkButton, marginTop: 4, fontSize: 12 }}>
                        Visa samtalet ›
                      </button>
                    )}
                  </div>
                  {editable && (
                    <button type="button" onClick={() => setEditing({ kind: 'edit', ref: b.ref })} style={smallGhost}>
                      Ändra
                    </button>
                  )}
                </li>
              )
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

const muted: React.CSSProperties = { margin: '10px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.45)' }

const linkButton: React.CSSProperties = {
  padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: '#93c5fd',
}

const navButton: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 10, cursor: 'pointer', fontSize: 18, lineHeight: 1,
  color: '#f6f3ee', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
}

const primaryButton: React.CSSProperties = {
  border: 'none', borderRadius: 9, padding: '7px 13px', fontSize: 12.5, fontWeight: 700,
  cursor: 'pointer', color: 'white', background: '#3b82f6',
}

const smallGhost: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.75)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
  padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
}
