'use client'

import LooprLogo from '@/app/components/LooprLogo'

interface AuditContent {
  summary?: string
  google_rating?: string
  google_reviews_count?: string
  missed_calls_pct?: number
  visibility_score?: number
  visibility_details?: {
    has_contact?: boolean
    has_hours?: boolean
    has_services?: boolean
    has_cta?: boolean
    has_reviews?: boolean
  }
  improvements?: string[]
}

export interface Audit {
  id: string
  business_name: string
  website_url: string
  share_id: string
  status: string
  content: AuditContent
  created_at: string
}

function ScoreRing({ score }: { score: number }) {
  const radius = 42
  const circ = 2 * Math.PI * radius
  const dash = (score / 100) * circ
  const color = score >= 70 ? '#4ade80' : score >= 40 ? '#C9A24B' : '#ef4444'
  return (
    <svg width="110" height="110" viewBox="0 0 110 110">
      <circle cx="55" cy="55" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
      <circle
        cx="55" cy="55" r={radius} fill="none"
        stroke={color} strokeWidth="10"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 55 55)"
      />
      <text x="55" y="55" textAnchor="middle" dominantBaseline="central" fill={color} fontSize="22" fontWeight="700">
        {score}
      </text>
      <text x="55" y="72" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9">
        / 100
      </text>
    </svg>
  )
}

export function AuditReport({ audit, isPublic = false }: { audit: Audit; isPublic?: boolean }) {
  const c = audit.content ?? {}
  const score = c.visibility_score ?? 50
  const improvements = c.improvements ?? []
  const details = c.visibility_details ?? {}

  const visChecks = [
    { label: 'Kontaktinformation', ok: details.has_contact },
    { label: 'Öppettider', ok: details.has_hours },
    { label: 'Tjänstelista', ok: details.has_services },
    { label: 'Tydlig CTA', ok: details.has_cta },
    { label: 'Recensioner', ok: details.has_reviews },
  ]

  const panelStyle: React.CSSProperties = {
    backgroundColor: 'rgba(21,19,19,0.85)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    backdropFilter: 'blur(8px)',
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#f6f3ee' }}>
      {/* Header */}
      <div style={{ ...panelStyle, padding: '24px 28px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <LooprLogo size="sm" />
              <span style={{ fontSize: 11, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>AI Audit Maker</span>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>{audit.business_name}</h1>
            <a
              href={audit.website_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#C9A24B', fontSize: 13, textDecoration: 'none', marginTop: 4, display: 'inline-block' }}
            >
              {audit.website_url} ↗
            </a>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{
              background: 'rgba(74,222,128,0.15)',
              color: '#4ade80',
              border: '1px solid rgba(74,222,128,0.3)',
              borderRadius: 20,
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: 600,
            }}>
              ✓ Completed
            </span>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 6 }}>
              {new Date(audit.created_at).toLocaleDateString('sv-SE')}
            </p>
          </div>
        </div>
        {c.summary && (
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.6, marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            {c.summary}
          </p>
        )}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        {/* Visibility score — the headline metric of the whole report */}
        <div style={{
          ...panelStyle,
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          gridColumn: '1 / -1',
          background: 'rgba(168,85,247,0.07)',
          borderColor: 'rgba(168,85,247,0.25)',
        }}>
          <ScoreRing score={score} />
          <div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Synlighetspoäng
            </p>
            <p style={{ color: '#f6f3ee', fontSize: 20, fontWeight: 700, lineHeight: 1.3, fontFamily: 'Arial, Helvetica, sans-serif' }}>
              {score >= 70 ? 'Bra närvaro' : score >= 40 ? 'Förbättringsbar' : 'Låg synlighet'}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 1.5, marginTop: 6, maxWidth: 420 }}>
              {score >= 70
                ? 'Grunden är på plats — men det finns fortfarande missade samtal att fånga upp.'
                : score >= 40
                  ? 'Flera snabba åtgärder skulle lyfta er synlighet rejält.'
                  : 'Kunder har svårt att hitta och nå er idag. Störst potential att vinna.'}
            </p>
          </div>
        </div>

        {/* Google rating */}
        <div style={{ ...panelStyle, padding: '20px 24px' }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 8 }}>Google-betyg</p>
          <p style={{ fontSize: 28, fontWeight: 700, color: '#C9A24B', margin: 0 }}>
            {c.google_rating ?? 'Okänt'}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>
            {c.google_reviews_count ?? '—'}
          </p>
        </div>

        {/* Missed calls */}
        <div style={{ ...panelStyle, padding: '20px 24px' }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 8 }}>Uppskattade missade samtal</p>
          <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--brick)', margin: 0 }}>
            {c.missed_calls_pct ?? 27}%
          </p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>Branschsnitt för SMF</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 16 }}>
        {/* Visibility checklist */}
        <div style={{ ...panelStyle, padding: '20px 24px' }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Online-checklista
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visChecks.map(({ label, ok }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 20, height: 20, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: ok ? 'rgba(74,222,128,0.15)' : 'rgba(168,85,247,0.15)',
                  border: `1px solid ${ok ? 'rgba(74,222,128,0.3)' : 'rgba(168,85,247,0.3)'}`,
                  fontSize: 11, flexShrink: 0,
                }}>
                  {ok ? '✓' : '✗'}
                </span>
                <span style={{ fontSize: 13, color: ok ? '#e8e4df' : 'rgba(255,255,255,0.45)' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Improvements */}
        {improvements.length > 0 && (
          <div style={{ ...panelStyle, padding: '20px 24px' }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Förbättringsförslag
            </p>
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {improvements.map((imp, i) => (
                <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{
                    minWidth: 22, height: 22, borderRadius: 6,
                    background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.35)',
                    color: 'var(--brick)', fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {i + 1}
                  </span>
                  <p style={{ fontSize: 13, color: '#e8e4df', margin: 0, lineHeight: 1.5 }}>{imp}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Public CTA */}
      {isPublic && (
        <div style={{ ...panelStyle, padding: '28px', textAlign: 'center', background: 'rgba(168,85,247,0.12)', borderColor: 'rgba(168,85,247,0.3)' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: '#f6f3ee', fontFamily: 'Arial, Helvetica, sans-serif' }}>
            Vill du se hur vi kan hjälpa {audit.business_name}?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 22, lineHeight: 1.6, maxWidth: 460, marginLeft: 'auto', marginRight: 'auto' }}>
            Boka en kostnadsfri demo — vi visar konkret hur Loopr kan förbättra er synlighet,
            minska missade samtal och automatisera kundkontakten.
          </p>
          <a
            href={`mailto:velarno.contact@gmail.com?subject=${encodeURIComponent(`Boka kostnadsfri demo — ${audit.business_name}`)}`}
            style={{
              display: 'inline-block',
              background: 'var(--brick)',
              color: 'white',
              borderRadius: 12,
              padding: '15px 34px',
              fontSize: 16,
              fontWeight: 700,
              textDecoration: 'none',
              boxShadow: '0 6px 22px rgba(168,85,247,0.35)',
            }}
          >
            Boka en kostnadsfri demo →
          </a>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 14 }}>
            Ingen bindningstid • Svar inom 24h
          </p>
        </div>
      )}
    </div>
  )
}
