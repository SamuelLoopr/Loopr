'use client'

import { useCallback, useEffect, useState } from 'react'
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
