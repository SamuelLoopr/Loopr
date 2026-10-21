'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { FiCalendar, FiChevronDown, FiChevronUp, FiX } from 'react-icons/fi'
import BookingForm from '@/app/components/BookingForm'
import type { BookingsApi } from '@/app/components/useBookings'
import { suggestBooking } from '@/lib/booking-suggestion'
import { CLIENT_NOTE_MAX, type ClientStatus } from '@/lib/client-status'
import { CONTACT_REQUEST_LABEL, type PublicCall } from '@/lib/public-calls'
import { formatBookingWhen, toStockholm } from '@/lib/stockholm-time'
import { GROUPS, formatDuration, fullWhen, groupOf, offHours, searchHit, statusForGroup } from './logic'
import { CallNumbers, OffHoursBadge, PromisedCallback, SmsLine, StatusBadge, cx } from './ui'
import s from './bos.module.css'

// Det valda ärendet, i en panel bredvid listan: allt om samtalet, status,
// anteckningar, bokning och — stängt tills man ber om det — hela samtalet.

export default function CasePanel({
  call,
  editable,
  bookings,
  query,
  busy,
  onClose,
  onMove,
  onSaveNote,
  onShowInCalendar,
}: {
  call: PublicCall
  editable: boolean
  /** Kalendern — finns bara när bokningar är påslagna för länken. */
  bookings?: BookingsApi
  query: string
  busy: boolean
  onClose: () => void
  onMove: (status: ClientStatus) => Promise<string | null>
  onSaveNote: (note: string) => Promise<string | null>
  onShowInCalendar: (date: string) => void
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const canEdit = editable && call.ref !== null
  const duration = formatDuration(call.durationSec)
  const current = groupOf(call.status)
  const [statusError, setStatusError] = useState('')

  // Fokus till rubriken när ett nytt ärende öppnas, så att skärmläsare och
  // tangentbord börjar i panelen.
  useEffect(() => {
    titleRef.current?.focus()
    setStatusError('')
  }, [call.ref])

  async function move(status: ClientStatus) {
    if (status === call.status) return
    setStatusError('')
    const err = await onMove(status)
    if (err) setStatusError(err)
  }

  return (
    <div className={s.panelInner}>
      <div className={s.panelHeader}>
        <div style={{ minWidth: 0 }}>
          <h2 ref={titleRef} tabIndex={-1} className={cx(s.panelTitle, !call.callerName && s.nameMissing)}>
            {call.callerName ?? 'Namn saknas'}
          </h2>
          <p className={s.panelMeta}>
            <time dateTime={call.startedAt}>{fullWhen(call.startedAt)}</time>
            {duration && ` · ${duration}`}
          </p>
          <div className={s.metaRow}>
            <StatusBadge status={call.status} />
            <OffHoursBadge kind={offHours(call.startedAt)} />
          </div>
        </div>
        <button type="button" className={cx(s.iconButton, s.panelClose)} onClick={onClose} aria-label="Stäng ärendet (Esc)" title="Stäng (Esc)">
          <FiX aria-hidden="true" size={17} />
        </button>
      </div>

      <section className={s.panelSection} aria-label="Telefonnummer">
        <CallNumbers from={call.callbackNumber} given={call.givenNumber} big />
        {!call.callbackNumber && !call.givenNumber && <p className={s.help}>Numret var dolt eller saknas.</p>}
        {!call.callbackNumber && call.givenNumber && <p className={s.help}>Kunden ringde med dolt nummer och gav det här numret att ringa upp på.</p>}
        {call.promisedCallback && <PromisedCallback label={call.promisedCallback} />}
        {call.sms && <SmsLine sms={call.sms} />}
      </section>

      {call.sms && call.sms.replies.length > 0 && (
        <section className={s.panelSection}>
          <h3 className={s.sectionLabel}>Sms-svar från kunden</h3>
          <ul className={s.smsReplyList}>
            {call.sms.replies.map((r, i) => (
              <li key={i} className={s.smsReply}>
                <time dateTime={r.at} className={s.smsReplyWhen}>{fullWhen(r.at)}</time>
                <p className={s.bodyText}>{r.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={s.panelSection}>
        <h3 className={s.sectionLabel}>Vad kunden vill</h3>
        {call.contactRequest ? (
          <>
            <span className={cx(s.badge, s.badgeRequest)}>Vill bli kontaktad · {CONTACT_REQUEST_LABEL[call.contactRequest]}</span>
            {call.contactNote && <p className={s.bodyText} style={{ marginTop: 8, fontWeight: 650 }}>{call.contactNote}</p>}
          </>
        ) : (
          <p className={s.bodyText} style={{ color: 'var(--ink-3)' }}>Kunden bad inte om att bli kontaktad.</p>
        )}
      </section>

      <section className={s.panelSection}>
        <h3 className={s.sectionLabel}>Sammanfattning</h3>
        <p className={s.bodyText}>{call.summary}</p>
      </section>

      {canEdit && (
        <section className={s.panelSection}>
          <h3 className={s.sectionLabel} id={`status-${call.ref}`}>Status</h3>
          <div className={s.statusSwitch} role="group" aria-labelledby={`status-${call.ref}`}>
            {GROUPS.map(g => (
              <button
                key={g.key}
                type="button"
                className={s.statusOption}
                data-group={g.key}
                aria-pressed={current === g.key}
                disabled={busy}
                onClick={() => move(statusForGroup(g.key, call.status))}
              >
                {g.label}
              </button>
            ))}
          </div>
          {statusError && <p className={s.error} role="alert">{statusError}</p>}
        </section>
      )}

      {canEdit && <NoteSection call={call} onSave={onSaveNote} />}

      {canEdit && bookings && (
        <BookingSection call={call} bookings={bookings} onMove={move} onShowInCalendar={onShowInCalendar} />
      )}

      <TranscriptSection call={call} query={query} />
    </div>
  )
}

function NoteSection({ call, onSave }: { call: PublicCall; onSave: (note: string) => Promise<string | null> }) {
  const [draft, setDraft] = useState(call.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const id = useId()
  const dirty = draft.trim() !== (call.note ?? '').trim()

  // Ett annat ärende: börja om från det som är sparat där.
  useEffect(() => {
    setDraft(call.note ?? '')
    setError('')
    setSaved(false)
    // Bara när ärendet byts — anteckningen själv hanteras nedan.
  }, [call.ref])

  // Anteckningen ändrad någon annanstans (en annan flik, en omladdning): ta in
  // den, men bara om man inte själv håller på att skriva.
  const shownNote = useRef(call.note)
  useEffect(() => {
    if (shownNote.current === call.note) return
    const typing = draft.trim() !== (shownNote.current ?? '').trim()
    shownNote.current = call.note
    if (!typing) setDraft(call.note ?? '')
  }, [call.note])

  async function save() {
    setSaving(true)
    setError('')
    const err = await onSave(draft)
    setSaving(false)
    if (err) { setError(err); return }
    setSaved(true)
  }

  return (
    <section className={s.panelSection}>
      <label htmlFor={id} className={s.sectionLabel} style={{ display: 'block' }}>Anteckningar</label>
      <textarea
        id={id}
        className={s.textarea}
        value={draft}
        maxLength={CLIENT_NOTE_MAX}
        rows={4}
        placeholder="T.ex. ringt tillbaka, skickar offert på fredag"
        onChange={e => { setDraft(e.target.value); setSaved(false) }}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && dirty) save() }}
      />
      <p className={s.help}>
        Syns för alla som har länken. Skriv inte personnummer här.
        {draft.length > CLIENT_NOTE_MAX - 200 && ` ${draft.length} av ${CLIENT_NOTE_MAX} tecken.`}
      </p>
      <div className={s.rowActions}>
        <button type="button" className={cx(s.btn, s.btnPrimary, s.btnSm)} onClick={save} disabled={saving || !dirty}>
          {saving ? 'Sparar…' : 'Spara anteckning'}
        </button>
        {dirty && !saving && (
          <button type="button" className={cx(s.btn, s.btnGhost, s.btnSm)} onClick={() => setDraft(call.note ?? '')}>
            Ångra ändringen
          </button>
        )}
        <span aria-live="polite" className={s.ok}>{saved && !dirty ? 'Sparat' : ''}</span>
      </div>
      {error && <p className={s.error} role="alert">{error}</p>}
    </section>
  )
}

function BookingSection({
  call,
  bookings,
  onMove,
  onShowInCalendar,
}: {
  call: PublicCall
  bookings: BookingsApi
  onMove: (status: ClientStatus) => Promise<void>
  onShowInCalendar: (date: string) => void
}) {
  const [open, setOpen] = useState(false)
  const linked = bookings.bookings.filter(b => b.callRef === call.ref)

  useEffect(() => { setOpen(false) }, [call.ref])

  const suggestion = open
    ? suggestBooking({
        startedAt: call.startedAt,
        callerName: call.callerName,
        contactRequest: call.contactRequest,
        contactNote: call.contactNote,
        summary: call.summary,
      })
    : null

  return (
    <section className={s.panelSection}>
      <h3 className={s.sectionLabel}>Bokning</h3>
      {linked.map(b => (
        <div key={b.ref} className={s.bookingItem}>
          <FiCalendar aria-hidden="true" size={16} style={{ color: '#115e59', flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className={s.bookingWhen}>{formatBookingWhen(b.startsAt)}</div>
            <div className={s.bookingTitle}>{b.title}</div>
          </div>
          <button type="button" className={cx(s.btn, s.btnSecondary, s.btnSm)} onClick={() => onShowInCalendar(toStockholm(b.startsAt).date)}>
            Visa i kalendern
          </button>
        </div>
      ))}
      {!open && (
        <button type="button" className={cx(s.btn, linked.length ? s.btnSecondary : s.btnPrimary)} onClick={() => setOpen(true)}>
          <FiCalendar aria-hidden="true" size={15} />
          {linked.length ? 'Boka en tid till' : 'Boka in i kalendern'}
        </button>
      )}
      {open && suggestion && (
        <BookingForm
          initial={{
            title: suggestion.title,
            date: suggestion.date,
            time: suggestion.time,
            durationMin: suggestion.durationMin,
            callerName: call.callerName ?? '',
            note: '',
          }}
          basis={suggestion.basis}
          submitLabel="Boka in"
          markBookedOption={call.status !== 'bokad'}
          onCancel={() => setOpen(false)}
          onSubmit={async (values, { markBooked }) => {
            const r = await bookings.create({ ...values, callRef: call.ref })
            if (r.error) return r.error
            setOpen(false)
            if (markBooked) await onMove('bokad')
            return null
          }}
        />
      )}
    </section>
  )
}

function TranscriptSection({ call, query }: { call: PublicCall; query: string }) {
  // Stängt som standard. Hittades sökordet bara i samtalet öppnas det, annars
  // syns inte varför ärendet kom med i sökningen.
  const onlyInTranscript = query.trim() !== '' && searchHit(call, query) === 'samtal'
  const [open, setOpen] = useState(onlyInTranscript)
  const id = useId()

  useEffect(() => { setOpen(onlyInTranscript) }, [call.ref, onlyInTranscript])

  return (
    <section className={s.panelSection}>
      <button type="button" className={cx(s.btn, s.btnSecondary, s.transcriptToggle)} aria-expanded={open} aria-controls={id}
        onClick={() => setOpen(v => !v)}>
        {open ? 'Dölj samtalet' : 'Visa hela samtalet'}
        {open ? <FiChevronUp aria-hidden="true" size={16} /> : <FiChevronDown aria-hidden="true" size={16} />}
      </button>
      {open && (
        <div id={id} className={s.transcript} role="region" aria-label="Hela samtalet">
          {call.transcript.length === 0 ? (
            <p className={s.help}>Inget transkript sparades för det här samtalet.</p>
          ) : (
            call.transcript.map((turn, i) => {
              const caller = turn.speaker !== 'receptionist'
              return (
                <div key={i} className={cx(s.bubble, caller ? s.bubbleCaller : s.bubbleAgent)}>
                  <span className={s.speaker}>
                    {turn.speaker === 'caller' ? (call.callerName ?? 'Kunden') : turn.speaker === 'receptionist' ? 'Receptionisten' : 'Samtalet'}
                  </span>
                  <Highlight text={turn.text} query={query} />
                </div>
              )
            })
          )}
        </div>
      )}
    </section>
  )
}

function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const parts: React.ReactNode[] = []
  let from = 0
  let at = lower.indexOf(needle)
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at))
    parts.push(<mark key={at} className={s.hit}>{text.slice(at, at + q.length)}</mark>)
    from = at + q.length
    at = lower.indexOf(needle, from)
  }
  parts.push(text.slice(from))
  return <>{parts}</>
}
