'use client'

import { useId, useState } from 'react'
import type { PublicCall, PublicContactRequest } from '@/lib/public-calls'

// The call log on the public Master Demo / BOS page (app/master/[shareId]).
// Presentational only: the page fetches /api/public-agent/[shareId]/calls and
// passes the result in. Numbers and contact details arrive already masked.

const REQUEST_LABEL: Record<PublicContactRequest, string> = {
  quote: 'Offert',
  meeting: 'Möte',
  callback: 'Återkoppling',
}

// Contact requests this recent are lifted to the top. Older ones stay in date
// order, still badged: the page has no login, so nothing on it can mark a
// request as handled, and without a cut-off an old one would sit above every
// newer call for ever.
const PINNED_FOR_DAYS = 30
const INITIAL_VISIBLE = 5

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

export default function CallList({ calls, processing }: { calls: PublicCall[]; processing: number }) {
  const [showAll, setShowAll] = useState(false)

  const cutoff = Date.now() - PINNED_FOR_DAYS * 86_400_000
  const pinned = calls.filter(c => c.contactRequest && new Date(c.startedAt).getTime() >= cutoff)
  const rest = calls.filter(c => !pinned.includes(c))
  const visibleRest = showAll ? rest : rest.slice(0, INITIAL_VISIBLE)

  return (
    <div>
      {pinned.length > 0 && (
        <>
          <GroupHeading label="Vill bli kontaktade" count={pinned.length} accent />
          <ul style={listStyle}>
            {pinned.map((call, i) => <CallCard key={`p${i}`} call={call} highlighted />)}
          </ul>
        </>
      )}

      {rest.length > 0 && (
        <>
          {pinned.length > 0 && <GroupHeading label="Övriga samtal" count={rest.length} spaced />}
          <ul style={listStyle}>
            {visibleRest.map((call, i) => <CallCard key={`r${i}`} call={call} highlighted={false} />)}
          </ul>
          {rest.length > INITIAL_VISIBLE && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setShowAll(v => !v)}
                style={{
                  background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
                  padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {showAll ? 'Visa färre' : `Visa alla ${rest.length} samtal`}
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

function GroupHeading({ label, count, accent = false, spaced = false }: {
  label: string
  count: number
  accent?: boolean
  /** Second group: clear space from the cards above it. */
  spaced?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: `${spaced ? 26 : 4}px 0 10px` }}>
      <h3 style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', margin: 0,
        color: accent ? 'var(--brick)' : 'rgba(255,255,255,0.45)',
      }}>
        {label}
      </h3>
      <span style={{
        fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: accent ? 'rgba(168,85,247,0.18)' : 'rgba(255,255,255,0.07)',
        color: accent ? 'var(--brick)' : 'rgba(255,255,255,0.55)',
      }}>
        {count}
      </span>
    </div>
  )
}

function CallCard({ call, highlighted }: { call: PublicCall; highlighted: boolean }) {
  const [open, setOpen] = useState(false)
  const transcriptId = useId()
  const duration = formatDuration(call.durationSec)

  return (
    <li style={{
      borderRadius: 16,
      background: highlighted ? 'rgba(168,85,247,0.08)' : 'rgba(21,19,19,0.85)',
      border: `1px solid ${highlighted ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.1)'}`,
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-controls={transcriptId}
        style={{
          display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
          background: 'none', border: 'none', color: 'inherit', font: 'inherit',
          padding: '16px 18px',
        }}
      >
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between',
          gap: '4px 12px', fontSize: 12.5,
        }}>
          <span style={{ color: '#f6f3ee', fontWeight: 600 }}>
            {formatWhen(call.startedAt)}
            {duration && <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 400 }}> · {duration}</span>}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontVariantNumeric: 'tabular-nums' }}>
            {call.caller}
          </span>
        </div>

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

        <span style={{ display: 'inline-block', marginTop: 12, fontSize: 12.5, fontWeight: 600, color: 'var(--brick)' }}>
          {open ? 'Dölj samtalet ▴' : 'Läs hela samtalet ▾'}
        </span>
      </button>

      {call.callbackNumber && (
        <div style={{ padding: '0 18px 14px' }}>
          <a
            href={`tel:${call.callbackNumber}`}
            style={{
              display: 'inline-block', fontSize: 13, fontWeight: 700, textDecoration: 'none',
              color: 'white', background: 'var(--brick)', borderRadius: 10, padding: '8px 14px',
            }}
          >
            Ring upp {call.callbackNumber}
          </a>
        </div>
      )}

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
                      {turn.speaker === 'caller' ? 'Kund' : turn.speaker === 'receptionist' ? 'Receptionist' : 'Samtal'}
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

const listStyle: React.CSSProperties = {
  listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10,
}

const footnoteStyle: React.CSSProperties = {
  fontSize: 11.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.35)', textAlign: 'center',
  margin: '14px auto 0', maxWidth: 460,
}
