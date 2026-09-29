'use client'

import { useId, useRef, useState } from 'react'
import type { PublicCall, PublicCallUpdate, PublicContactRequest } from '@/lib/public-calls'
import {
  CLIENT_NOTE_MAX,
  CLIENT_STATUSES,
  CLIENT_STATUS_LABEL,
  CRM_GROUPS,
  type ClientStatus,
} from '@/lib/client-status'

// The client's calls on their public BOS page (app/master/[shareId]) — a minimal
// CRM: calls grouped by the follow-up status the client sets, a note per call,
// and the full conversation one click away.
//
// Numbers and contact details arrive already masked. Status and notes are saved
// through /api/public-agent/[shareId]/calls/[ref], which only accepts calls that
// belong to this share id. Before 028_bos_client_crm has run the route serves
// `editable: false` and this renders a read-only list.

const REQUEST_LABEL: Record<PublicContactRequest, string> = {
  quote: 'Offert',
  meeting: 'Möte',
  callback: 'Återkoppling',
}

const STATUS_COLOR: Record<ClientStatus, { fg: string; bg: string; border: string }> = {
  ny:             { fg: 'var(--brick)', bg: 'rgba(168,85,247,0.14)', border: 'rgba(168,85,247,0.35)' },
  kontaktad:      { fg: 'var(--gold)',  bg: 'rgba(201,162,75,0.14)', border: 'rgba(201,162,75,0.35)' },
  offert_skickad: { fg: '#60a5fa',      bg: 'rgba(96,165,250,0.14)', border: 'rgba(96,165,250,0.35)' },
  bokad:          { fg: '#4ade80',      bg: 'rgba(74,222,128,0.12)', border: 'rgba(74,222,128,0.3)' },
  avslutad:       { fg: 'rgba(255,255,255,0.55)', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.14)' },
}

// Done is done: the Klart group starts folded so the page opens on what needs doing.
const INITIALLY_COLLAPSED: Record<string, boolean> = { klart: true }
const ALL_VIEW_PAGE = 8

type View = 'status' | 'all'
type Save = (ref: string, update: PublicCallUpdate) => Promise<string | null>

const WHEN = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** "mån 28 sep · 19:50", with the year only when it is not this year. */
function formatWhen(iso: string): string {
  // formatToParts rather than format(): the joined sv-SE string ("mån 28 sep.
  // 2026 19:50") varies between ICU versions; the parts do not.
  const parts = (d: Date): Record<string, string> =>
    Object.fromEntries(WHEN.formatToParts(d).map(p => [p.type, p.value.replace(/\.$/, '')]))

  const p = parts(new Date(iso))
  const thisYear = parts(new Date()).year
  return `${p.weekday} ${p.day} ${p.month}${p.year !== thisYear ? ` ${p.year}` : ''} · ${p.hour}:${p.minute}`
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return ''
  if (seconds < 60) return `${seconds} s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s ? `${m} min ${s} s` : `${m} min`
}

// ISO timestamps from PostgREST all carry +00:00, so they sort as strings.
const newestFirst = (a: PublicCall, b: PublicCall) => b.startedAt.localeCompare(a.startedAt)
const requestsFirst = (a: PublicCall, b: PublicCall) =>
  Number(Boolean(b.contactRequest)) - Number(Boolean(a.contactRequest)) || newestFirst(a, b)

export default function CallList({
  shareId,
  calls: initialCalls,
  processing,
  editable,
}: {
  shareId: string
  calls: PublicCall[]
  processing: number
  editable: boolean
}) {
  const [calls, setCalls] = useState(initialCalls)
  const [view, setView] = useState<View>('status')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(INITIALLY_COLLAPSED)
  const [showAll, setShowAll] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const announcementTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const save: Save = async (ref, update) => {
    const before = calls.find(c => c.ref === ref)
    // Status moves the card at once; a failed save puts it back.
    if (update.status) setCalls(cs => cs.map(c => (c.ref === ref ? { ...c, status: update.status! } : c)))

    try {
      const res = await fetch(`/api/public-agent/${encodeURIComponent(shareId)}/calls/${ref}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Kunde inte spara.')

      setCalls(cs => cs.map(c => (c.ref === ref ? { ...c, status: body.status, note: body.note } : c)))
      if (update.status && before && update.status !== before.status) {
        const group = CRM_GROUPS.find(g => g.statuses.includes(update.status!))
        const who = before.callerName ?? 'Samtalet'
        setAnnouncement(`${who} flyttades till ”${group?.label ?? CLIENT_STATUS_LABEL[update.status]}”.`)
        clearTimeout(announcementTimer.current)
        announcementTimer.current = setTimeout(() => setAnnouncement(''), 4000)
      }
      return null
    } catch (err) {
      if (before) setCalls(cs => cs.map(c => (c.ref === ref ? before : c)))
      return err instanceof Error ? err.message : 'Kunde inte spara.'
    }
  }

  const statusView = editable && view === 'status'
  const chronological = [...calls].sort(newestFirst)
  const visibleAll = showAll ? chronological : chronological.slice(0, ALL_VIEW_PAGE)

  return (
    <div>
      {editable && (
        <div
          role="group"
          aria-label="Visa samtal"
          style={{
            display: 'flex', gap: 4, padding: 4, borderRadius: 12, width: 'fit-content', margin: '0 auto 18px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {([['status', 'Per status'], ['all', `Alla samtal (${calls.length})`]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
              style={{
                border: 'none', borderRadius: 9, padding: '7px 14px', fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer',
                background: view === key ? 'rgba(168,85,247,0.22)' : 'transparent',
                color: view === key ? '#f6f3ee' : 'rgba(255,255,255,0.55)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Rendered even when empty: a live region must exist before its text changes. */}
      <p aria-live="polite" style={{
        margin: announcement ? '0 0 12px' : 0, fontSize: 12.5, color: '#4ade80', textAlign: 'center',
      }}>
        {announcement}
      </p>

      {statusView ? (
        CRM_GROUPS.map(group => {
          const groupCalls = calls
            .filter(c => group.statuses.includes(c.status))
            .sort(group.key === 'nya' ? requestsFirst : newestFirst)
          const isCollapsed = Boolean(collapsed[group.key])
          return (
            <section key={group.key} style={{ marginBottom: 18 }}>
              <button
                type="button"
                onClick={() => setCollapsed(prev => ({ ...prev, [group.key]: !isCollapsed }))}
                aria-expanded={!isCollapsed}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '4px 0 10px',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', font: 'inherit',
                }}
              >
                <span aria-hidden="true" style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', width: 10 }}>
                  {isCollapsed ? '▸' : '▾'}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: group.key === 'nya' ? 'var(--brick)' : 'rgba(255,255,255,0.55)',
                }}>
                  {group.label}
                </span>
                <CountPill count={groupCalls.length} accent={group.key === 'nya' && groupCalls.length > 0} />
              </button>

              {!isCollapsed && (groupCalls.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.35)', margin: '0 0 4px 18px' }}>
                  Inga samtal här just nu.
                </p>
              ) : (
                <ul style={listStyle}>
                  {groupCalls.map((call, i) => (
                    <CallCard key={call.ref ?? `${group.key}${i}`} call={call} editable={editable} onSave={save} />
                  ))}
                </ul>
              ))}
            </section>
          )
        })
      ) : (
        <>
          <ul style={listStyle}>
            {visibleAll.map((call, i) => (
              <CallCard key={call.ref ?? `a${i}`} call={call} editable={editable} onSave={save} />
            ))}
          </ul>
          {chronological.length > ALL_VIEW_PAGE && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button type="button" onClick={() => setShowAll(v => !v)} style={ghostButton}>
                {showAll ? 'Visa färre' : `Visa alla ${chronological.length} samtal`}
              </button>
            </div>
          )}
        </>
      )}

      {processing > 0 && (
        <p style={{ ...footnoteStyle, color: 'rgba(255,255,255,0.55)', marginTop: 16 }}>
          {processing === 1 ? '1 samtal bearbetas' : `${processing} samtal bearbetas`} just nu —
          sammanfattningen visas här inom någon minut.
        </p>
      )}

      <p style={footnoteStyle}>
        Telefonnummer, e-post och personnummer döljs på den här sidan eftersom alla som har
        länken kan öppna den.
      </p>
    </div>
  )
}

function CountPill({ count, accent = false }: { count: number; accent?: boolean }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: accent ? 'rgba(168,85,247,0.18)' : 'rgba(255,255,255,0.07)',
      color: accent ? 'var(--brick)' : 'rgba(255,255,255,0.55)',
    }}>
      {count}
    </span>
  )
}

function CallCard({ call, editable, onSave }: { call: PublicCall; editable: boolean; onSave: Save }) {
  const [open, setOpen] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)
  const transcriptId = useId()
  const duration = formatDuration(call.durationSec)
  const canEdit = editable && call.ref !== null
  // Purple = someone asked to be contacted and nobody has acted on it yet.
  const needsAction = Boolean(call.contactRequest) && call.status === 'ny'

  async function changeStatus(next: ClientStatus) {
    if (!call.ref || next === call.status) return
    setSavingStatus(true)
    setStatusError('')
    const error = await onSave(call.ref, { status: next })
    setSavingStatus(false)
    if (error) setStatusError(error)
  }

  return (
    <li style={{
      borderRadius: 16,
      background: needsAction ? 'rgba(168,85,247,0.08)' : 'rgba(21,19,19,0.85)',
      border: `1px solid ${needsAction ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.1)'}`,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 18px' }}>
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
          gap: '6px 12px', fontSize: 12.5,
        }}>
          <span style={{ color: '#f6f3ee', fontWeight: 600 }}>
            {formatWhen(call.startedAt)}
            {duration && <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 400 }}> · {duration}</span>}
          </span>
          {canEdit && <StatusSelect value={call.status} disabled={savingStatus} onChange={changeStatus} />}
        </div>

        <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.4 }}>
          {call.callerName && (
            <span style={{ color: '#f6f3ee', fontWeight: 700, fontSize: 14.5 }}>{call.callerName} · </span>
          )}
          <span style={{ color: 'rgba(255,255,255,0.45)', fontVariantNumeric: 'tabular-nums' }}>{call.caller}</span>
        </p>

        {statusError && <p role="alert" style={errorText}>{statusError}</p>}

        {call.contactRequest && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            <span style={{
              fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
              background: 'var(--brick)', color: 'white',
            }}>
              Vill bli kontaktad
            </span>
            <span style={{
              fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 20,
              background: 'rgba(168,85,247,0.14)', color: 'var(--brick)',
              border: '1px solid rgba(168,85,247,0.3)',
            }}>
              {REQUEST_LABEL[call.contactRequest]}
            </span>
          </div>
        )}

        {call.contactNote && (
          <p style={{ fontSize: 14.5, fontWeight: 600, color: '#f6f3ee', margin: '10px 0 0', lineHeight: 1.45 }}>
            {call.contactNote}
          </p>
        )}

        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', margin: '8px 0 0', lineHeight: 1.55 }}>
          {call.summary}
        </p>

        {canEdit && <NoteEditor call={call} onSave={onSave} />}

        {call.callbackNumber && (
          <a
            href={`tel:${call.callbackNumber}`}
            style={{
              display: 'inline-block', marginTop: 12, fontSize: 13, fontWeight: 700, textDecoration: 'none',
              color: 'white', background: 'var(--brick)', borderRadius: 10, padding: '8px 14px',
            }}
          >
            Ring upp {call.callbackNumber}
          </a>
        )}

        <div>
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
            aria-controls={transcriptId}
            style={{
              marginTop: 12, padding: 0, background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12.5, fontWeight: 600, color: 'var(--brick)',
            }}
          >
            {open ? 'Dölj samtalet ▴' : 'Läs hela samtalet ▾'}
          </button>
        </div>
      </div>

      {open && (
        <div
          id={transcriptId}
          role="region"
          aria-label="Hela samtalet"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.08)', padding: '14px 18px 18px',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          {call.transcript.length === 0 ? (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
              Inget transkript sparades för det här samtalet.
            </p>
          ) : (
            call.transcript.map((turn, i) => {
              const isCaller = turn.speaker !== 'receptionist'
              return (
                <div key={i} style={{ display: 'flex', justifyContent: isCaller ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '82%', padding: '9px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.5,
                    background: isCaller ? 'rgba(168,85,247,0.16)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${isCaller ? 'rgba(168,85,247,0.28)' : 'rgba(255,255,255,0.1)'}`,
                    color: isCaller ? '#f6f3ee' : 'rgba(255,255,255,0.85)',
                  }}>
                    <span style={{
                      display: 'block', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.06em', opacity: 0.55, marginBottom: 3,
                    }}>
                      {turn.speaker === 'caller' ? (call.callerName ?? 'Kund') : turn.speaker === 'receptionist' ? 'Receptionist' : 'Samtal'}
                    </span>
                    {turn.text}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </li>
  )
}

function StatusSelect({
  value, disabled, onChange,
}: {
  value: ClientStatus
  disabled: boolean
  onChange: (next: ClientStatus) => void
}) {
  const color = STATUS_COLOR[value]
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value as ClientStatus)}
      aria-label="Status för samtalet"
      style={{
        appearance: 'none', WebkitAppearance: 'none', cursor: disabled ? 'wait' : 'pointer',
        fontSize: 12, fontWeight: 700, padding: '5px 26px 5px 11px', borderRadius: 20,
        color: color.fg, background: color.bg, border: `1px solid ${color.border}`,
        backgroundImage: 'linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%)',
        backgroundPosition: 'calc(100% - 13px) 50%, calc(100% - 9px) 50%',
        backgroundSize: '4px 4px, 4px 4px',
        backgroundRepeat: 'no-repeat',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {CLIENT_STATUSES.map(s => (
        <option key={s} value={s} style={{ color: '#151313' }}>{CLIENT_STATUS_LABEL[s]}</option>
      ))}
    </select>
  )
}

function NoteEditor({ call, onSave }: { call: PublicCall; onSave: Save }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(call.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const fieldId = useId()

  async function save() {
    if (!call.ref) return
    setSaving(true)
    setError('')
    const err = await onSave(call.ref, { note: draft })
    setSaving(false)
    if (err) setError(err)
    else setEditing(false)
  }

  if (!editing) {
    return call.note ? (
      <div style={{
        marginTop: 12, padding: '10px 12px', borderRadius: 10,
        background: 'rgba(201,162,75,0.07)', border: '1px solid rgba(201,162,75,0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gold)' }}>
            Er anteckning
          </span>
          <button
            type="button"
            onClick={() => { setDraft(call.note ?? ''); setEditing(true) }}
            style={{ ...linkButton, color: 'var(--gold)' }}
          >
            Redigera
          </button>
        </div>
        <p style={{ margin: '5px 0 0', fontSize: 13.5, lineHeight: 1.5, color: '#f6f3ee', whiteSpace: 'pre-wrap' }}>
          {call.note}
        </p>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => { setDraft(''); setEditing(true) }}
        style={{ ...linkButton, display: 'block', marginTop: 12, color: 'rgba(255,255,255,0.6)' }}
      >
        + Lägg till anteckning
      </button>
    )
  }

  return (
    <div style={{ marginTop: 12 }}>
      <label htmlFor={fieldId} style={{
        display: 'block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 6,
      }}>
        Er anteckning
      </label>
      <textarea
        id={fieldId}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        maxLength={CLIENT_NOTE_MAX}
        rows={3}
        autoFocus
        placeholder="T.ex. ringt tillbaka, skickar offert på fredag"
        style={{
          width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
          fontSize: 13.5, lineHeight: 1.5, padding: '9px 11px', borderRadius: 10, outline: 'none',
          color: '#f6f3ee', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
        }}
      />
      <p style={{ margin: '4px 0 0', fontSize: 11, lineHeight: 1.45, color: 'rgba(255,255,255,0.4)' }}>
        Syns för alla som har länken — skriv inte telefonnummer eller personnummer här.
        {draft.length > CLIENT_NOTE_MAX - 200 && ` ${draft.length} / ${CLIENT_NOTE_MAX}`}
      </p>
      {error && <p role="alert" style={errorText}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            border: 'none', borderRadius: 9, padding: '8px 16px', fontSize: 12.5, fontWeight: 700,
            cursor: saving ? 'wait' : 'pointer', color: 'white', background: 'var(--brick)', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Sparar…' : 'Spara'}
        </button>
        <button type="button" onClick={() => { setEditing(false); setError('') }} disabled={saving} style={ghostButton}>
          Avbryt
        </button>
      </div>
    </div>
  )
}

const listStyle: React.CSSProperties = {
  listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10,
}

const footnoteStyle: React.CSSProperties = {
  fontSize: 11.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.35)', textAlign: 'center',
  margin: '14px auto 0', maxWidth: 460,
}

const ghostButton: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9,
  padding: '8px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
}

const linkButton: React.CSSProperties = {
  padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
}

const errorText: React.CSSProperties = {
  margin: '6px 0 0', fontSize: 12, color: '#f87171',
}
