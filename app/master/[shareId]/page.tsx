'use client'

import { useState, useEffect, use, useRef } from 'react'
import LooprLogo from '@/app/components/LooprLogo'
import Panel from '@/app/components/Panel'
import VoiceDemo from '@/app/components/VoiceDemo'
import SmsDemo, { type SmsDemoClient } from '@/app/components/SmsDemo'
import BenefitCards from '@/app/components/BenefitCards'

// ─── Types (mirror /api/public-agent/[shareId]/master) ────────────────────────
interface MasterData {
  business: {
    agentName: string
    businessName: string | null
    industry: string | null
    description: string | null
    services: string | null
    status: string | null
  }
  // Section toggles from the builder. Optional so an older payload (or a DB
  // without migration 017) still renders every section, exactly as before.
  voice?: boolean
  benefits?: boolean
  audit: {
    shareId: string
    websiteUrl: string
    visibilityScore: number
    summary: string | null
    googleRating: string | null
    missedCallsPct: number
    improvements: string[]
    createdAt: string
  } | null
  sms: (SmsDemoClient & { shareId: string }) | null
  proposal: {
    shareId: string
    title: string
    tagline: string | null
    avgJobValue: number | null
  } | null
}


// ─── Small building blocks ────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const radius = 42
  const circ = 2 * Math.PI * radius
  const dash = (score / 100) * circ
  const color = score >= 70 ? '#4ade80' : score >= 40 ? '#C9A24B' : '#ef4444'
  return (
    <svg width="110" height="110" viewBox="0 0 110 110" style={{ flexShrink: 0 }}>
      <circle cx="55" cy="55" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
      <circle
        cx="55" cy="55" r={radius} fill="none"
        stroke={color} strokeWidth="10"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 55 55)"
      />
      <text x="55" y="55" textAnchor="middle" dominantBaseline="central" fill={color} fontSize="22" fontWeight="700">{score}</text>
      <text x="55" y="72" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="9">/ 100</text>
    </svg>
  )
}

function Section({
  eyebrow, title, blurb, children, id,
}: {
  eyebrow: string
  title: string
  blurb?: string
  children: React.ReactNode
  id?: string
}) {
  return (
    <section id={id} style={{ marginTop: 64, scrollMarginTop: 24 }}>
      <p style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
        color: 'var(--brick)', marginBottom: 8, textAlign: 'center',
      }}>
        {eyebrow}
      </p>
      <h2 style={{
        fontSize: 24, fontWeight: 700, textAlign: 'center', margin: 0,
        fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: 1.25, color: '#f6f3ee',
      }}>
        {title}
      </h2>
      {blurb && (
        <p style={{
          textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 14,
          lineHeight: 1.6, marginTop: 10, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto',
        }}>
          {blurb}
        </p>
      )}
      <div style={{ marginTop: 24 }}>{children}</div>
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function MasterDemoPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = use(params)
  const [data, setData] = useState<MasterData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const voiceRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/public-agent/${shareId}/master`)
      .then(res => res.json().then(body => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) { setNotFound(true); return }
        setData(body)
      })
      .catch(() => setNotFound(true))
  }, [shareId])

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1023 55%, #0f0f0f 100%)',
    padding: '40px 16px 48px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#f6f3ee',
  }

  if (notFound) {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔌</div>
          <p style={{ color: '#888' }}>Den här demolänken är inte längre aktiv.</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#555' }}>Laddar demo…</p>
      </div>
    )
  }

  const { business, audit, sms, proposal } = data
  const showVoice = data.voice !== false
  const showBenefits = data.benefits !== false
  const displayName = business.businessName || business.agentName
  const serviceList = (business.services ?? '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 5)

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* ── 1. Hero ───────────────────────────────────────────────────── */}
        <header style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22, opacity: 0.8 }}>
            <LooprLogo size="sm" />
          </div>

          <div style={{
            width: 72, height: 72, borderRadius: 20, margin: '0 auto 20px',
            background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34,
          }}>
            📞
          </div>

          <h1 style={{
            fontSize: 32, fontWeight: 700, margin: 0, lineHeight: 1.2,
            fontFamily: 'Arial, Helvetica, sans-serif',
          }}>
            Hej {displayName}!
          </h1>
          <p style={{
            color: 'rgba(255,255,255,0.6)', fontSize: 16, lineHeight: 1.6,
            marginTop: 14, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto',
          }}>
            Här är vad Loopr kan göra för er — byggt specifikt för{' '}
            <strong style={{ color: 'var(--brick)' }}>{displayName}</strong>
            {business.industry ? ` inom ${business.industry.toLowerCase()}` : ''}. Allt nedan är
            på riktigt, inte en inspelning.
          </p>

          {serviceList.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 18 }}>
              {serviceList.map(s => (
                <span key={s} style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 20,
                  backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.7)',
                }}>
                  {s}
                </span>
              ))}
            </div>
          )}

          {showVoice && (
          <>
          <button
            onClick={() => voiceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            style={{
              marginTop: 26, background: 'var(--brick)', color: 'white', border: 'none',
              borderRadius: 12, padding: '16px 30px', fontSize: 16, fontWeight: 700,
              cursor: 'pointer', boxShadow: '0 6px 22px rgba(168,85,247,0.35)',
              maxWidth: '100%',
            }}
          >
            🎙 Prata med er AI-receptionist nu
          </button>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 12 }}>
            Tar 30 sekunder • Inget konto behövs
          </p>
          </>
          )}
        </header>

        {/* ── 2. Voice ──────────────────────────────────────────────────── */}
        {showVoice && (
        <div ref={voiceRef}>
          <Section
            id="rost"
            eyebrow="Steg 1 — AI-receptionisten"
            title="Ring upp och testa själv"
            blurb="Det här är en riktig AI-receptionist tränad på er verksamhet. Tryck på knappen och prata — den svarar som den skulle gjort för en kund."
          >
            <VoiceDemo
              shareId={shareId}
              displayName={displayName}
              ctaLabel="🎙 Starta samtalet"
            />
          </Section>
        </div>
        )}

        {/* ── 3. SMS review automation (hidden when not set up) ─────────── */}
        {sms && (
          <Section
            eyebrow="Steg 2 — Recensionsautomation"
            title="Fler Google-recensioner, helt automatiskt"
            blurb={`Efter varje avslutat jobb går det ut ett SMS. Klicka igenom flödet nedan precis som er kund skulle göra.`}
          >
            <SmsDemo client={sms} showIntro={false} />
          </Section>
        )}

        {/* ── 4. Audit highlights (hidden when no audit exists) ─────────── */}
        {audit && (
          <Section
            eyebrow="Steg 3 — Er synlighet idag"
            title="Så ser ni ut online just nu"
            blurb="En automatisk genomlysning av er webbplats och närvaro — här är höjdpunkterna."
          >
            <Panel padding="p-6" tiltMaxAngle={4} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
                <ScoreRing score={audit.visibilityScore} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={{
                    color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 4,
                    textTransform: 'uppercase', letterSpacing: '0.08em',
                  }}>
                    Synlighetspoäng
                  </p>
                  <p style={{
                    fontSize: 20, fontWeight: 700, lineHeight: 1.3, margin: 0,
                    fontFamily: 'Arial, Helvetica, sans-serif',
                  }}>
                    {audit.visibilityScore >= 70 ? 'Bra närvaro' : audit.visibilityScore >= 40 ? 'Förbättringsbar' : 'Låg synlighet'}
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>
                    {audit.summary
                      ?? (audit.visibilityScore >= 70
                        ? 'Grunden är på plats — men det finns fortfarande missade samtal att fånga upp.'
                        : audit.visibilityScore >= 40
                          ? 'Flera snabba åtgärder skulle lyfta er synlighet rejält.'
                          : 'Kunder har svårt att hitta och nå er idag. Störst potential att vinna.')}
                  </p>
                </div>
              </div>
            </Panel>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
              <Panel padding="p-5" tiltMaxAngle={6}>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 8 }}>Google-betyg</p>
                <p style={{ fontSize: 26, fontWeight: 700, color: 'var(--gold)', margin: 0 }}>
                  {audit.googleRating ?? 'Okänt'}
                </p>
              </Panel>
              <Panel padding="p-5" tiltMaxAngle={6}>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 8 }}>Missade samtal</p>
                <p style={{ fontSize: 26, fontWeight: 700, color: 'var(--brick)', margin: 0 }}>
                  {audit.missedCallsPct}%
                </p>
              </Panel>
            </div>

            {audit.improvements.length > 0 && (
              <Panel padding="p-6" tiltMaxAngle={4}>
                <p style={{
                  color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 16,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>
                  Största möjligheterna
                </p>
                <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {audit.improvements.map((imp, i) => (
                    <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <span style={{
                        minWidth: 24, height: 24, borderRadius: 7,
                        background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.35)',
                        color: 'var(--brick)', fontSize: 12, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {i + 1}
                      </span>
                      <p style={{ fontSize: 14, color: '#e8e4df', margin: 0, lineHeight: 1.55 }}>{imp}</p>
                    </li>
                  ))}
                </ol>
              </Panel>
            )}

            <div style={{ textAlign: 'center', marginTop: 18 }}>
              <a
                href={`/audit/${audit.shareId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block', color: 'var(--brick)', fontSize: 14, fontWeight: 600,
                  textDecoration: 'none', border: '1px solid rgba(168,85,247,0.3)',
                  background: 'rgba(168,85,247,0.08)', borderRadius: 10, padding: '11px 22px',
                }}
              >
                Se full rapport ↗
              </a>
            </div>
          </Section>
        )}

        {/* ── 5. Why Loopr ──────────────────────────────────────────────── */}
        {showBenefits && (
        <Section
          eyebrow="Varför Loopr"
          title="Byggt för svenska lokala företag"
          blurb="Inget krångel, ingen lång implementation — bara färre missade jobb."
        >
          <BenefitCards />
        </Section>
        )}

        {/* ── 6. Proposal / price (hidden when no proposal exists) ──────── */}
        {proposal && (
          <Section
            eyebrow="Ert förslag"
            title={proposal.title}
            blurb={proposal.tagline ?? undefined}
          >
            <Panel padding="p-8" tiltMaxAngle={4} glowColor="201, 162, 75">
              {proposal.avgJobValue != null && (
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <p style={{
                    color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 8,
                    textTransform: 'uppercase', letterSpacing: '0.1em',
                  }}>
                    Uppskattat värde
                  </p>
                  <p style={{
                    fontSize: 40, fontWeight: 700, color: 'var(--gold)', margin: 0,
                    fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: 1.1,
                  }}>
                    {Number(proposal.avgJobValue).toLocaleString('sv-SE')} kr
                  </p>
                </div>
              )}
              <div style={{ textAlign: 'center' }}>
                <a
                  href={`/forslag/${proposal.shareId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-block', color: 'var(--gold)', fontSize: 14, fontWeight: 600,
                    textDecoration: 'none', border: '1px solid rgba(201,162,75,0.3)',
                    background: 'rgba(201,162,75,0.08)', borderRadius: 10, padding: '11px 22px',
                  }}
                >
                  Läs hela förslaget ↗
                </a>
              </div>
            </Panel>
          </Section>
        )}

        {/* ── Closing CTA ───────────────────────────────────────────────── */}
        <Section eyebrow="Nästa steg" title={`Vill ni se hur det funkar för ${displayName}?`}>
          <Panel padding="p-8" tiltMaxAngle={4} style={{ textAlign: 'center' }}>
            <p style={{
              color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.6, marginBottom: 24,
              maxWidth: 440, marginLeft: 'auto', marginRight: 'auto',
            }}>
              Boka en kostnadsfri genomgång — vi visar konkret hur Loopr minskar missade samtal
              och automatiserar kundkontakten hos er.
            </p>
            <a
              href={`mailto:velarno.contact@gmail.com?subject=${encodeURIComponent(`Boka kostnadsfri demo — ${displayName}`)}`}
              style={{
                display: 'inline-block', background: 'var(--brick)', color: 'white',
                borderRadius: 12, padding: '15px 34px', fontSize: 16, fontWeight: 700,
                textDecoration: 'none', boxShadow: '0 6px 22px rgba(168,85,247,0.35)',
              }}
            >
              Boka en kostnadsfri demo →
            </a>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 14 }}>
              Ingen bindningstid • Svar inom 24h
            </p>
          </Panel>
        </Section>

        {/* ── 7. Footer ─────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 6, marginTop: 56, opacity: 0.55,
        }}>
          <LooprLogo size="sm" />
          <p style={{
            fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.3)', textAlign: 'center',
          }}>
            Skapat med Loopr
          </p>
        </div>
      </div>
    </div>
  )
}
