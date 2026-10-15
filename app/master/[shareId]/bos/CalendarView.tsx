'use client'

import { useEffect, useMemo, useState } from 'react'
import { FiCalendar, FiChevronLeft, FiChevronRight, FiPlus } from 'react-icons/fi'
import BookingForm, { type BookingDraft } from '@/app/components/BookingForm'
import type { BookingsApi } from '@/app/components/useBookings'
import { suggestBooking } from '@/lib/booking-suggestion'
import type { ClientStatus } from '@/lib/client-status'
import { CONTACT_REQUEST_LABEL, type PublicCall } from '@/lib/public-calls'
import type { PublicBooking } from '@/lib/public-bookings'
import {
  addDays, formatBookingWhen, fromStockholm, startOfWeek, toStockholm, todayInStockholm,
} from '@/lib/stockholm-time'
import { groupOf, relativeWhen } from './logic'
import { cx } from './ui'
import s from './bos.module.css'

// Kalendern på klientens BOS-sida: månaden till vänster, vald dag till höger
// tillsammans med ärenden som väntar på en bokning, så att man kan boka in ett
// ärende direkt härifrån. Dagarna är svenska dagar oavsett enhetens tidszon.

const WEEKDAYS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']
const MONTH_LABEL = new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const DAY_LABEL = new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })

/** En svensk dag som en UTC-tid, så att formaterarna ovan skriver just den dagen. */
function asUtc(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
}

function draftFrom(b: PublicBooking): BookingDraft {
  const st = toStockholm(b.startsAt)
  return {
    title: b.title,
    date: st.date,
    time: st.time,
    durationMin: Math.round((new Date(b.endsAt).getTime() - new Date(b.startsAt).getTime()) / 60_000),
    callerName: b.callerName ?? '',
    note: b.note ?? '',
  }
}

type Editing = { kind: 'new' } | { kind: 'edit'; ref: string } | { kind: 'call'; call: PublicCall } | null

export default function CalendarView({
  api,
  focus,
  calls,
  onShowCall,
  onMove,
}: {
  api: BookingsApi
  /** Hoppa till en dag, t.ex. från "Visa i kalendern" i ett ärende. `n` gör att upprepningar räknas. */
  focus: { date: string; n: number } | null
  /** Ärendena, för listan över dem som väntar på en bokning. Tom när samtalen är avstängda. */
  calls: PublicCall[]
  onShowCall?: (ref: string) => void
  onMove: (call: PublicCall, status: ClientStatus) => Promise<string | null>
}) {
  const today = todayInStockholm()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selected, setSelected] = useState(today)
  const [editing, setEditing] = useState<Editing>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [editable, setEditable] = useState(false)

  const gridStart = startOfWeek(`${month}-01`)
  // Fem eller sex veckor: bara så många rader som månaden behöver.
  const weeks = useMemo(() => {
    let n = 4
    while (addDays(gridStart, n * 7).startsWith(month)) n++
    return n
  }, [gridStart, month])
  const days = useMemo(() => Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i)), [gridStart, weeks])

  const { loadWindow } = api
  useEffect(() => {
    let cancelled = false
    loadWindow(fromStockholm(gridStart, '00:00'), fromStockholm(addDays(gridStart, 42), '00:00')).then(result => {
      if (cancelled) return
      if (!result) { setState(prev => (prev === 'ready' ? prev : 'unavailable')); return }
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
      map.set(day, [...(map.get(day) ?? []), b])
    }
    return map
  }, [api.bookings])

  // Ärenden som någon vill ha en tid eller ett samtal om, som inte är klara och inte har någon bokning.
  const toBook = useMemo(() => {
    const booked = new Set(api.bookings.map(b => b.callRef).filter(Boolean))
    return calls
      .filter(c => c.ref && c.contactRequest && groupOf(c.status) !== 'klart' && !booked.has(c.ref))
      .sort((a, b) => Number(b.contactRequest === 'meeting') - Number(a.contactRequest === 'meeting') || b.startedAt.localeCompare(a.startedAt))
      .slice(0, 6)
  }, [api.bookings, calls])

  const now = Date.now()
  const nextUp = api.bookings.find(b => new Date(b.endsAt).getTime() > now)
  const dayList = byDay.get(selected) ?? []

  function show(date: string) {
    setMonth(date.slice(0, 7))
    setSelected(date)
  }

  if (state === 'unavailable') {
    return (
      <p className={cx(s.notice, s.noticeError)} role="alert">
        Kalendern kunde inte laddas just nu. Ladda om sidan om en stund.
      </p>
    )
  }

  return (
    <div className={s.calLayout}>
      <div className={s.card2}>
        <div className={s.calHeader}>
          <h2 className={s.monthTitle} aria-live="polite">{capitalize(MONTH_LABEL.format(asUtc(`${month}-01`)))}</h2>
          <button type="button" className={s.iconButton} onClick={() => setMonth(m => shiftMonth(m, -1))} aria-label="Föregående månad">
            <FiChevronLeft aria-hidden="true" size={17} />
          </button>
          <button type="button" className={s.iconButton} onClick={() => setMonth(m => shiftMonth(m, 1))} aria-label="Nästa månad">
            <FiChevronRight aria-hidden="true" size={17} />
          </button>
          <button type="button" className={cx(s.btn, s.btnSecondary, s.btnSm)} onClick={() => show(today)}
            disabled={month === today.slice(0, 7) && selected === today}>
            Idag
          </button>
          {nextUp && (
            <button type="button" className={cx(s.btn, s.btnGhost, s.btnSm)} style={{ marginLeft: 'auto' }}
              onClick={() => show(toStockholm(nextUp.startsAt).date)}>
              Nästa bokning: {formatBookingWhen(nextUp.startsAt)}
            </button>
          )}
        </div>

        <div className={s.calGrid}>
          {WEEKDAYS.map(w => <div key={w} className={s.weekday} aria-hidden="true">{w}</div>)}
          {days.map(day => {
            const inMonth = day.startsWith(month)
            const list = byDay.get(day) ?? []
            return (
              <button
                key={day}
                type="button"
                className={cx(s.day, !inMonth && s.dayOut, day === today && s.dayToday, day === selected && s.daySelected)}
                onClick={() => { setSelected(day); setEditing(null) }}
                aria-pressed={day === selected}
                aria-label={`${DAY_LABEL.format(asUtc(day))}${day === today ? ', idag' : ''}${list.length ? `, ${list.length} ${list.length === 1 ? 'bokning' : 'bokningar'}` : ''}`}
              >
                <span className={s.dayNum}>{Number(day.slice(8))}</span>
                {list.slice(0, 3).map(b => (
                  <span key={b.ref} className={s.chip}>{toStockholm(b.startsAt).time} {b.title}</span>
                ))}
                {list.length > 3 && <span className={s.more}>+{list.length - 3} till</span>}
                {list.length > 0 && (
                  <span className={s.dots} aria-hidden="true">
                    {list.slice(0, 3).map(b => <span key={b.ref} className={s.dot} />)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className={cx(s.card2, s.agenda)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 className={s.agendaTitle}>{capitalize(DAY_LABEL.format(asUtc(selected)))}</h2>
          {editable && editing?.kind !== 'new' && (
            <button type="button" className={cx(s.btn, s.btnPrimary, s.btnSm)} style={{ marginLeft: 'auto' }}
              onClick={() => setEditing({ kind: 'new' })}>
              <FiPlus aria-hidden="true" size={15} /> Ny bokning
            </button>
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

        {editing?.kind === 'call' && (() => {
          const call = editing.call
          const sug = suggestBooking({
            startedAt: call.startedAt, callerName: call.callerName, contactRequest: call.contactRequest,
            contactNote: call.contactNote, summary: call.summary,
          })
          return (
            <BookingForm
              key={call.ref}
              initial={{ title: sug.title, date: sug.date, time: sug.time, durationMin: sug.durationMin, callerName: call.callerName ?? '', note: '' }}
              basis={sug.basis}
              context={`Bokning för ${call.callerName ?? 'ärendet'} från ${relativeWhen(call.startedAt)}.`}
              submitLabel="Boka in"
              markBookedOption={call.status !== 'bokad'}
              onCancel={() => setEditing(null)}
              onSubmit={async (values, { markBooked }) => {
                const r = await api.create({ ...values, callRef: call.ref })
                if (r.error || !r.booking) return r.error ?? 'Bokningen kunde inte sparas.'
                setEditing(null)
                show(toStockholm(r.booking.startsAt).date)
                if (markBooked) await onMove(call, 'bokad')
                return null
              }}
            />
          )
        })()}

        {state === 'loading' && dayList.length === 0 ? (
          <p className={s.help}>Laddar kalendern…</p>
        ) : dayList.length === 0 ? (
          editing?.kind !== 'new' && editing?.kind !== 'call' && <p className={s.help} style={{ marginTop: 10 }}>Inget bokat den här dagen.</p>
        ) : (
          <ul className={s.agendaList}>
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
                <li key={b.ref} className={s.agendaItem}>
                  <span className={s.agendaTime}>{toStockholm(b.startsAt).time}–{toStockholm(b.endsAt).time}</span>
                  <div className={s.agendaText}>
                    <p className={s.agendaItemTitle}>{b.title}</p>
                    {b.callerName && <p className={s.agendaSub}>{b.callerName}</p>}
                    {b.note && <p className={s.agendaSub}>{b.note}</p>}
                    {b.callRef && onShowCall && (
                      <button type="button" className={s.linkButton} style={{ marginTop: 4, fontSize: 13.5 }} onClick={() => onShowCall(b.callRef!)}>
                        Visa ärendet
                      </button>
                    )}
                  </div>
                  {editable && (
                    <button type="button" className={cx(s.btn, s.btnSecondary, s.btnSm)} onClick={() => setEditing({ kind: 'edit', ref: b.ref })}>
                      Ändra
                    </button>
                  )}
                </li>
              )
            ))}
          </ul>
        )}

        {editable && toBook.length > 0 && editing?.kind !== 'call' && (
          <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid #efeae2' }}>
            <h3 className={s.sectionLabel}>Ärenden utan bokning</h3>
            <ul className={s.toBook}>
              {toBook.map(c => (
                <li key={c.ref}>
                  <button type="button" className={s.toBookItem} onClick={() => setEditing({ kind: 'call', call: c })}>
                    <FiCalendar aria-hidden="true" size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span className={s.toBookText}>
                      <span className={s.toBookName}>{c.callerName ?? 'Namn saknas'}</span>
                      {' · '}{CONTACT_REQUEST_LABEL[c.contactRequest!]}
                      <span className={s.toBookWant}>{c.contactNote ?? c.summary}</span>
                    </span>
                    <span className={cx(s.btn, s.btnSecondary, s.btnSm)} aria-hidden="true">Boka</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
