'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import LooprLogo from '@/app/components/LooprLogo'
import CallList from '@/app/components/CallList'
import BookingCalendar from '@/app/components/BookingCalendar'
import { useBookings } from '@/app/components/useBookings'
import type { PublicCallsResponse } from '@/lib/public-calls'
import { CONTACT_EMAIL } from '@/lib/contact'
import Section from './Section'

// The page a paying client uses every day — /master/[shareId] with the agent in
// client mode (agents.client_mode, 029). Calls, calendar and account, nothing
// else: no sales copy, no demo, no "boka demo". The master route does not even
// send the sales content in this mode (app/api/public-agent/[shareId]/master).

export interface ClientPageData {
  mode: 'client'
  business: { agentName: string; businessName: string | null }
  /** Whether the calls section is switched on for this link. */
  calls: boolean
  account: {
    receptionistActive: boolean
    phoneNumbers: string[]
    callsLast30Days: number
    /**
     * Andelen samtal AI-receptionisten klarade helt själv, senaste 30 dagarna.
     * Null när det är för få samtal att räkna på — raden visas då inte.
     */
    resolution: { percent: number; solved: number; rated: number } | null
    /** Adressen samtalsnotiserna går till. Null = notiser av. */
    notificationEmail: string | null
  }
}

export default function ClientView({
  shareId,
  data,
  calls,
}: {
  shareId: string
  data: ClientPageData
  /** Null while loading, and when the calls could not be read. */
  calls: PublicCallsResponse | null
}) {
  const bookings = useBookings(shareId)
  const [calendarFocus, setCalendarFocus] = useState<{ date: string; n: number } | null>(null)
  const [callFocus, setCallFocus] = useState<{ ref: string; n: number } | null>(null)
  const name = data.business.businessName || data.business.agentName

  // Bookings that arrived with the calls list join the calendar's store, so the
  // call cards and the calendar are always showing the same bookings.
  const { merge } = bookings
  useEffect(() => {
    if (calls) merge(calls.calls.flatMap(c => c.bookings ?? []))
  }, [calls, merge])

  useEffect(() => {
    document.title = `${name} · Samtal och bokningar`
  }, [name])

  const showInCalendar = useCallback((date: string) => {
    setCalendarFocus(prev => ({ date, n: (prev?.n ?? 0) + 1 }))
    document.getElementById('kalender')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const showCall = useCallback((ref: string) => {
    setCallFocus(prev => ({ ref, n: (prev?.n ?? 0) + 1 }))
  }, [])

  const hasCalls = Boolean(calls && (calls.calls.length > 0 || calls.processing > 0))

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1023 55%, #0f0f0f 100%)',
      padding: '36px 16px 48px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: '#f6f3ee',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        <header style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18, opacity: 0.7 }}>
            <LooprLogo size="sm" />
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0, lineHeight: 1.2, fontFamily: 'Arial, Helvetica, sans-serif' }}>
            {name}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, marginTop: 10 }}>
            Samtal och bokningar från er AI-receptionist
          </p>
          <nav aria-label="Sidans delar" style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 18 }}>
            {[
              ...(data.calls ? [['#samtal', 'Samtal']] : []),
              ['#kalender', 'Kalender'],
              ['#konto', 'Ert konto'],
            ].map(([href, label]) => (
              <a key={href} href={href} style={{
                fontSize: 12.5, fontWeight: 600, textDecoration: 'none', padding: '7px 14px', borderRadius: 20,
                color: 'rgba(255,255,255,0.75)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              }}>
                {label}
              </a>
            ))}
          </nav>
        </header>

        {data.calls && (
          <Section
            id="samtal"
            eyebrow="Samtal"
            title="Inkommande samtal"
            blurb="Sätt status när ni har hört av er, skriv egna anteckningar och boka in direkt från samtalet."
          >
            {!calls ? (
              <p style={centerMuted}>Laddar samtal…</p>
            ) : !hasCalls ? (
              <p style={centerMuted}>
                Inga samtal än. Varje samtal som er AI-receptionist tar dyker upp här, med sammanfattning.
              </p>
            ) : (
              <CallList
                shareId={shareId}
                calls={calls.calls}
                processing={calls.processing}
                editable={calls.editable}
                bookings={calls.bookingsEnabled ? bookings : undefined}
                onShowBooking={showInCalendar}
                focus={callFocus}
              />
            )}
          </Section>
        )}

        <Section id="kalender" eyebrow="Kalender" title="Bokningar">
          <BookingCalendar api={bookings} focus={calendarFocus} onShowCall={data.calls ? showCall : undefined} />
        </Section>

        <Section id="konto" eyebrow="Ert konto" title="Om ert konto">
          <div style={{
            borderRadius: 18, padding: '6px 18px',
            background: 'rgba(21,19,19,0.85)', border: '1px solid rgba(255,255,255,0.1)',
          }}>
            <AccountRow label="AI-receptionisten">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span aria-hidden="true" style={{
                  width: 8, height: 8, borderRadius: 4,
                  background: data.account.receptionistActive ? '#4ade80' : 'rgba(255,255,255,0.35)',
                }} />
                {data.account.receptionistActive ? 'Aktiv — svarar i telefon' : 'Pausad'}
              </span>
            </AccountRow>
            <AccountRow label="Telefonnummer">
              {data.account.phoneNumbers.length
                ? data.account.phoneNumbers.join(', ')
                : <span style={{ color: 'rgba(255,255,255,0.45)' }}>Inget nummer kopplat än</span>}
            </AccountRow>
            <AccountRow label="Samtal senaste 30 dagarna">{data.account.callsLast30Days}</AccountRow>
            {data.account.resolution && (
              <AccountRow label="Löstes av receptionisten">
                <span style={{ fontWeight: 700, color: '#4ade80' }}>
                  {data.account.resolution.percent} %
                </span>
                <span style={{ color: 'rgba(255,255,255,0.45)', marginLeft: 8, fontSize: 13 }}>
                  {data.account.resolution.solved} av {data.account.resolution.rated} samtal krävde
                  ingen uppföljning från er
                </span>
              </AccountRow>
            )}
            <NotificationEmailRow shareId={shareId} initial={data.account.notificationEmail} />
            <AccountRow label="Frågor om ert konto" last>
              <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Fråga om kontot — ${name}`)}`}
                style={{ color: '#c4b5fd', textDecoration: 'none', fontWeight: 600 }}>
                {CONTACT_EMAIL}
              </a>
            </AccountRow>
          </div>
        </Section>

        <footer style={{ display: 'flex', justifyContent: 'center', marginTop: 56, opacity: 0.45 }}>
          <LooprLogo size="sm" />
        </footer>
      </div>
    </div>
  )
}

/**
 * Adressen som samtalsnotiserna går till — klientens egen inställning, ändrad
 * här på deras sida utan inloggning. Sparas via
 * /api/public-agent/[shareId]/settings, som bara tar emot det här fältet och
 * bara för agenten bakom länken.
 */
function NotificationEmailRow({ shareId, initial }: { shareId: string; initial: string | null }) {
  const [saved, setSaved] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [justSaved, setJustSaved] = useState(false)
  const fieldId = useId()

  async function save() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/public-agent/${encodeURIComponent(shareId)}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationEmail: draft }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setError(body?.error ?? 'Kunde inte spara.'); return }
      setSaved(body.notificationEmail ?? null)
      setDraft(body.notificationEmail ?? '')
      setEditing(false)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 3000)
    } catch {
      setError('Ingen kontakt med servern. Kontrollera anslutningen och försök igen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '13px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>Mejla mig vid nya samtal</span>
        {!editing && (
          <span style={{ fontSize: 14, color: '#f6f3ee', textAlign: 'right' }}>
            {saved ?? <span style={{ color: 'rgba(255,255,255,0.45)' }}>Av</span>}
            <button
              type="button"
              onClick={() => { setDraft(saved ?? ''); setError(''); setEditing(true) }}
              style={{
                marginLeft: 12, padding: 0, background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 600, color: '#c4b5fd',
              }}
            >
              {saved ? 'Ändra' : 'Lägg till'}
            </button>
          </span>
        )}
      </div>

      {editing ? (
        <div style={{ marginTop: 10 }}>
          <label htmlFor={fieldId} style={{
            display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 6,
          }}>
            Vi mejlar en sammanfattning så fort ett samtal är klart. Lämna tomt för att stänga av.
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              id={fieldId}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={draft}
              autoFocus
              placeholder="namn@företag.se"
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
              style={{
                flex: '1 1 220px', minWidth: 0, boxSizing: 'border-box', fontSize: 14,
                padding: '9px 11px', borderRadius: 9, outline: 'none', color: '#f6f3ee',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
              }}
            />
            <button type="button" onClick={save} disabled={busy} style={{
              border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700,
              cursor: busy ? 'wait' : 'pointer', color: 'white', background: 'var(--brick)', opacity: busy ? 0.6 : 1,
            }}>
              {busy ? 'Sparar…' : 'Spara'}
            </button>
            <button type="button" onClick={() => { setEditing(false); setError('') }} disabled={busy} style={{
              background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9,
              padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              Avbryt
            </button>
          </div>
          {error && <p role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, color: '#f87171' }}>{error}</p>}
        </div>
      ) : justSaved ? (
        <p aria-live="polite" style={{ margin: '6px 0 0', fontSize: 12, color: '#4ade80', textAlign: 'right' }}>
          {saved ? 'Sparat — notiser är på.' : 'Sparat — notiser är av.'}
        </p>
      ) : null}
    </div>
  )
}

function AccountRow({ label, children, last = false }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap',
      padding: '13px 0', borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.07)',
    }}>
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{label}</span>
      <span style={{ fontSize: 14, color: '#f6f3ee', textAlign: 'right' }}>{children}</span>
    </div>
  )
}

const centerMuted: React.CSSProperties = {
  textAlign: 'center', fontSize: 13.5, color: 'rgba(255,255,255,0.45)', margin: 0,
}
