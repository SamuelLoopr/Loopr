'use client'

import { useRef, useState, useEffect } from 'react'
import LooprLogo from '@/app/components/LooprLogo'
import Panel from '@/app/components/Panel'
import VoiceDemo from '@/app/components/VoiceDemo'
import SmsDemo, { type SmsDemoClient } from '@/app/components/SmsDemo'
import ParticleText from '@/app/components/ParticleText'
import CountUp from '@/app/components/CountUp'
import SpecularButton from '@/app/components/SpecularButton'
import Threads from '@/app/components/Threads'
import FadeContent from '@/app/components/FadeContent'
import { CONTACT_EMAIL, startBookingContact } from '@/lib/contact'
import GlareHover from '@/app/components/GlareHover'
import GradientText from '@/app/components/GradientText'
import ScrollVelocity from '@/app/components/ScrollVelocity'
import ElectricBorder from '@/app/components/ElectricBorder'
import LogoLoop from '@/app/components/LogoLoop'
import {
  SiNextdotjs, SiTypescript, SiTailwindcss, SiReact,
  SiSupabase, SiElevenlabs, SiAnthropic, SiGreensock,
} from 'react-icons/si'

// Public presentation page for Loopr itself — shareable with anyone, with no
// shareId, no agent and no lead behind it.
//
// ISOLATION RULE: this page must contain no route into the product. No
// dashboard links, no login, no shared header or sidebar (it lives outside the
// (dashboard) route group, so it gets neither), and the logo is rendered as a
// plain image rather than a link. Outbound links are mailto:, tel: and in-page
// scroll anchors. SpecularButton's onClick must stay mailto-or-scroll only.
//
// The ONE sanctioned internal link is the pair /om-loopr <-> /varfor-loopr:
// both are public presentation pages with no way into the product. Do not add
// any other internal href.

// Threads takes normalised RGB, not a hex string: #A855F7 = 168/85/247.
const BRICK_RGB: [number, number, number] = [168 / 255, 85 / 255, 247 / 255]

// Tech actually used in this codebase. Twilio is also used but react-icons has
// no SiTwilio, so it is left out rather than swapped for a wrong mark.
// Every href is an external site — never an internal route.
const TECH = [
  { node: <SiNextdotjs />, title: 'Next.js', href: 'https://nextjs.org' },
  { node: <SiTypescript />, title: 'TypeScript', href: 'https://www.typescriptlang.org' },
  { node: <SiReact />, title: 'React', href: 'https://react.dev' },
  { node: <SiTailwindcss />, title: 'Tailwind CSS', href: 'https://tailwindcss.com' },
  { node: <SiSupabase />, title: 'Supabase', href: 'https://supabase.com' },
  { node: <SiElevenlabs />, title: 'ElevenLabs', href: 'https://elevenlabs.io' },
  { node: <SiAnthropic />, title: 'Anthropic', href: 'https://www.anthropic.com' },
  { node: <SiGreensock />, title: 'GSAP', href: 'https://gsap.com' },
]

// Everything on this page is illustrative — no customer data is read.
const DEMO_SMS_CLIENT: SmsDemoClient = {
  // Short and easy to say aloud: three open syllables, no consonant clusters.
  // The SMS mockup derives the header, the {{företag}} placeholder and the
  // avatar initial from this one value.
  business_name: 'Solvik Rör',
  // No protocol, so nothing linkifies it and it reads as an example. The
  // "Lämna Google-recension" button is non-navigating via illustrative={true}.
  google_review_url: 'exempel.se/recension',
  delay_minutes: 30,
  message_template:
    'Hej {{kund_namn}}, tack för att du valde {{företag}}! Vi skulle uppskatta en snabb recension på Google: {{review_url}}',
}

// The lost-revenue figure is the product of the two above it, so the arithmetic
// on screen is honest: 47 × 2 000 = 94 000.
const MISSED_CALLS = 47
const ORDER_VALUE = 2000
const LOST_REVENUE = MISSED_CALLS * ORDER_VALUE

// ParticleText derives its particle budget from the CANVAS area and caps it at
// 5200, so the size needed for even coverage is not linear in viewport width.
// Measured against the full-viewport canvas by solving for ~1.15x geometric
// coverage; smaller reads gappy, larger turns the letters into blobs.
const PARTICLE_SIZE_BY_WIDTH: [number, number][] = [
  [375, 3.6],
  [768, 3.6],
  [1280, 5.1],
  [1440, 5.1],
  [1920, 7.3],
]

function particleSizeFor(viewportWidth: number): number {
  const pts = PARTICLE_SIZE_BY_WIDTH
  if (viewportWidth <= pts[0][0]) return pts[0][1]
  if (viewportWidth >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i - 1]
    const [x2, y2] = pts[i]
    if (viewportWidth <= x2) return y1 + ((y2 - y1) * (viewportWidth - x1)) / (x2 - x1)
  }
  return pts[pts.length - 1][1]
}

// Four capabilities, presented as a spec sheet. No icon set is installed in
// this project, so these use a numbered index rather than hand-drawn SVGs —
// numerals are typographically consistent by construction, where four bespoke
// line-icons would risk mismatched stroke weight and optical sizing.
//
// Each card carries one concrete proof detail. IMPORTANT: we have no customer
// performance data yet (zero review_requests, zero audits in the database), so
// every figure here is either a product spec we control or an explicitly
// labelled example — see the footnote rendered under the grid. Do not turn
// these into unqualified outcome claims without real data behind them.
type FeatureProof = 'voice' | 'rating' | 'timeline' | 'outbound'

const FEATURES: {
  n: string
  title: string
  body: string
  accent: string
  proof: FeatureProof
  /** Revealed on hover — a second concrete product fact, not marketing. */
  reveal: string
}[] = [
  {
    n: '01',
    title: 'AI-receptionist',
    body: 'Svarar på varje inkommande samtal, dygnet runt, på flytande svenska.',
    accent: '#A855F7',
    proof: 'voice',
    reveal: 'Kopplas till ert befintliga nummer.',
  },
  {
    n: '02',
    title: 'Recensionsautomation',
    body: 'Automatiserad uppföljning som omvandlar nöjda kunder till Google-recensioner.',
    accent: '#C084FC',
    proof: 'rating',
    reveal: 'Missnöjda kunder leds till er inkorg i stället.',
  },
  {
    n: '03',
    title: 'SMS-uppföljning',
    body: 'Missade samtal och obesvarade förfrågningar följs upp automatiskt inom minuter.',
    accent: '#8B5CF6',
    proof: 'timeline',
    reveal: 'Fördröjningen ställs in per verksamhet.',
  },
  {
    n: '04',
    title: 'AI-telefonförsäljning',
    body: 'Er AI kontaktar nya leads proaktivt och bokar in möten åt säljteamet.',
    accent: '#A855F7',
    proof: 'outbound',
    reveal: 'Ringer bara listor ni själva har godkänt.',
  },
]

// ─── Proof visuals — all inline SVG/CSS, no emoji ─────────────────────────
const proofLabel: React.CSSProperties = {
  fontSize: 10.5, color: 'rgba(255,255,255,0.5)', margin: 0, letterSpacing: '0.01em',
}

function VoiceProof({ accent }: { accent: string }) {
  // Pulsing status dot (same language as the "Driftsatt" indicator in the
  // receptionist list) plus a waveform hinting at the live demo further down.
  const bars = [0.45, 0.8, 1, 0.65, 0.9, 0.5, 0.75]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        className="loopr-status-dot"
        style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', flexShrink: 0, display: 'block' }}
      />
      <svg width="52" height="16" viewBox="0 0 52 16" aria-hidden="true" style={{ flexShrink: 0 }}>
        {bars.map((h, i) => (
          <rect
            key={i}
            className="loopr-wave-bar"
            x={i * 7.5} y={8 - (h * 12) / 2} width="2.5" height={h * 12} rx="1.25"
            fill={accent} opacity={0.75}
            style={{ animationDelay: `${i * 0.09}s` }}
          />
        ))}
      </svg>
      <p style={proofLabel}>Svarstid under 2 sek</p>
    </div>
  )
}

function RatingProof({ accent }: { accent: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'flex', gap: 2, flexShrink: 0 }} aria-hidden="true">
        {[0, 1, 2, 3, 4].map(i => (
          <svg key={i} width="12" height="12" viewBox="0 0 24 24" fill={accent} opacity={i === 4 ? 0.45 : 1}>
            <path d="M12 3.5l2.6 5.75 6.15.62-4.6 4.16 1.3 6.07L12 16.9l-5.45 3.2 1.3-6.07-4.6-4.16 6.15-.62z" />
          </svg>
        ))}
      </span>
      <p style={proofLabel}>Exempel: 4,9 i snitt</p>
    </div>
  )
}

function TimelineProof({ accent }: { accent: string }) {
  const steps = ['Missat samtal', 'SMS skickat', 'Kund svarar']
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
      {steps.map((label, i) => (
        <div key={label} style={{ display: 'contents' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: i === 0 ? 'transparent' : accent,
              border: `1.5px solid ${accent}`, display: 'block',
            }} />
            <span style={{
              fontSize: 8.5, lineHeight: 1.25, color: 'rgba(255,255,255,0.45)',
              textAlign: 'center', letterSpacing: '0.01em',
            }}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <svg width="14" height="8" viewBox="0 0 14 8" aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }}>
              <path d="M0 4h11M8.5 1.5L11 4l-2.5 2.5" fill="none" stroke={accent} strokeWidth="1.2"
                strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
            </svg>
          )}
        </div>
      ))}
    </div>
  )
}

function OutboundProof({ accent }: { accent: string }) {
  // Arrow points out/up to separate this from the three inbound capabilities.
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span style={{
        width: 22, height: 22, borderRadius: 7, flexShrink: 0,
        border: `1px solid ${accent}`, background: `${accent}1F`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"
          fill="none" stroke={accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17L17 7" />
          <path d="M8.5 7H17v8.5" />
        </svg>
      </span>
      <p style={proofLabel}>Proaktiv kontakt inom 24h</p>
    </div>
  )
}

function FeatureProofVisual({ kind, accent }: { kind: FeatureProof; accent: string }) {
  if (kind === 'voice') return <VoiceProof accent={accent} />
  if (kind === 'rating') return <RatingProof accent={accent} />
  if (kind === 'timeline') return <TimelineProof accent={accent} />
  return <OutboundProof accent={accent} />
}

const STEPS = [
  { n: 1, title: 'Vi lär känna verksamheten', body: 'Tjänster, priser, upptagningsområde och hur ni vill att samtal ska hanteras. Tar ungefär en timme.' },
  { n: 2, title: 'Vi bygger er AI-receptionist', body: 'Tränad på just era tjänster, med svensk röst. Ni får testa och justera tonen innan den går live.' },
  { n: 3, title: 'Den kopplas till ert nummer', body: 'Den svarar när ni inte hinner — eller på alla samtal, ni bestämmer. Inget telefonbyte krävs.' },
  { n: 4, title: 'Recensionerna börjar rulla in', body: 'Efter varje avslutat jobb går ett SMS ut automatiskt. Nöjda kunder leds till Google, missnöjda till er inkorg.' },
]

function Section({
  eyebrow, title, titleNode, blurb, children, innerRef,
}: {
  eyebrow: string
  title?: string
  /** Use instead of `title` when the heading needs its own element. */
  titleNode?: React.ReactNode
  blurb?: string
  children?: React.ReactNode
  innerRef?: React.Ref<HTMLDivElement>
}) {
  return (
    <section ref={innerRef} style={{ marginTop: 72, scrollMarginTop: 24 }}>
      <p style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
        color: 'var(--brick)', marginBottom: 8, textAlign: 'center',
      }}>
        {eyebrow}
      </p>
      <h2 style={{
        fontSize: 26, fontWeight: 700, textAlign: 'center', margin: 0,
        fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: 1.25, color: '#f6f3ee',
      }}>
        {titleNode ?? title}
      </h2>
      {blurb && (
        <p style={{
          textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 15,
          lineHeight: 1.65, marginTop: 12, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto',
        }}>
          {blurb}
        </p>
      )}
      {children && <div style={{ marginTop: 28 }}>{children}</div>}
    </section>
  )
}

// One stat in the "what a missed call costs" row. CountUp starts itself when
// the card scrolls into view (motion's useInView, once), so nothing here needs
// its own observer.
function StatCard({
  label, to, suffix, separator, emphasis,
}: {
  label: string
  to: number
  suffix?: string
  separator?: string
  emphasis?: boolean
}) {
  return (
    <Panel padding="p-6" tiltMaxAngle={6} enableStars={false} style={{ textAlign: 'left' }}>
      {/* Same eyebrow treatment as the 01-04 index on the capability cards, so
          the two rows read as one design system. */}
      <p style={{
        fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
        color: 'var(--brick)', marginBottom: 14,
      }}>
        {label}
      </p>
      <p style={{
        fontSize: 34, fontWeight: 700, lineHeight: 1.05, margin: 0,
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: emphasis ? 'var(--brick)' : '#f6f3ee',
      }}>
        <CountUp from={0} to={to} duration={1} direction="up" separator={separator} />
        {suffix && <span style={{ fontSize: 18, marginLeft: 4, opacity: 0.75 }}>{suffix}</span>}
      </p>
    </Panel>
  )
}

export default function OmLooprPage() {
  // Seeded from the real viewport on the very first client render. Setting it
  // in an effect instead would change the prop right after mount, re-running
  // ParticleText's effect and restarting the gather animation for no reason.
  const [particleSize, setParticleSize] = useState(() =>
    typeof window === 'undefined' ? 5.1 : particleSizeFor(window.innerWidth)
  )
  useEffect(() => {
    const update = () => setParticleSize(particleSizeFor(window.innerWidth))
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const solutionsRef = useRef<HTMLDivElement>(null)
  const voiceRef = useRef<HTMLDivElement>(null)
  const smsRef = useRef<HTMLDivElement>(null)
  const howRef = useRef<HTMLDivElement>(null)
  const ctaRef = useRef<HTMLDivElement>(null)

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) =>
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1023 55%, #0f0f0f 100%)',
    padding: '0 16px 56px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#f6f3ee',
  }

  const ghostBtn: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)', color: 'var(--cream)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 18, padding: '15px 30px', fontSize: 15.5, fontWeight: 700,
    cursor: 'pointer', textDecoration: 'none', display: 'inline-block',
  }

  return (
    <div style={pageStyle}>
      {/* ── Animated background ───────────────────────────────────────────
          Fixed to the viewport so it sits behind every section and stays put
          while the page scrolls. It lives inside this page (not the root
          layout) because the layout's ColorBends is already fully hidden here
          by pageStyle's opaque gradient — so this replaces a background that
          was never visible on this route, and every other page is untouched. */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
        <Threads
          color={BRICK_RGB}
          amplitude={1}
          distance={0}
          enableMouseInteraction={true}
        />
      </div>

      {/* Scrim between the moving lines and the copy. Tune this one value if
          the threads ever compete with the text. */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        background: 'rgba(10, 8, 14, 0.45)',
        pointerEvents: 'none',
      }} />

      {/* position + z-index makes this a stacking context, so every z-index
          inside the page (the hero's particle layer included) stays above the
          background without needing to know about it. */}
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── 1. Hero — fills the first screen, ParticleText assembles on load ── */}
        <header style={{
          minHeight: '100vh',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignItems: 'center',
          textAlign: 'center',
          paddingTop: 'clamp(20px, 5vh, 64px)',
          paddingBottom: 24,
        }}>
          {/* The particle canvas covers the whole hero so particles can start
              anywhere on screen and fly inward. textAnchorY keeps the letters
              in the upper fifth even though the canvas is full-height, and the
              layer sits at z-index 0 so the copy below stays clickable. */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
            <ParticleText
              text="LOOPR"
              particleSize={particleSize}
              density={3}
              color="#ffffff"
              highlightColor="#A855F7"
              scatterMode="viewport"
              textAnchorY={0.22}
              scatter={120}
              gatherDuration={1800}
              stagger={400}
              pointerRepel={40}
              repelRadius={130}
              idleDrift={0.9}
              trigger="mount"
              fontSize="clamp(3rem, 17vw, 20rem)"
              fontWeight={900}
              fontFamily="inherit"
              glow
              style={{ minHeight: 0 }}
            />
          </div>

          {/* Reserves the band the letters land in: 22vh (the anchor) plus half
              the glyph height, which tracks viewport width at ~6vw. */}
          <div aria-hidden style={{ height: 'calc(18vh + 8vw + 14px)', flexShrink: 0, pointerEvents: 'none' }} />

          <div style={{
            position: 'relative', zIndex: 1,
            display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%',
          }}>
            <h1 style={{
              fontSize: 'clamp(26px, 4.6vw, 40px)', fontWeight: 700, margin: 0, lineHeight: 1.15,
              fontFamily: 'Arial, Helvetica, sans-serif',
            }}>
              Svarar på varje samtal.<br />
              <span style={{ color: 'var(--brick)' }}>Även när ni inte kan.</span>
            </h1>

            <p style={{
              color: 'rgba(255,255,255,0.62)', fontSize: 'clamp(15px, 1.8vw, 17px)', lineHeight: 1.6,
              marginTop: 16, maxWidth: 540,
            }}>
              Loopr ger svenska lokala servicebolag en AI-receptionist som svarar dygnet runt på
              svenska, bokar jobb — och ser till att nöjda kunder faktiskt lämnar en Google-recension.
            </p>

            <div style={{
              display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center',
              flexWrap: 'wrap', marginTop: 26,
            }}>
              <button onClick={() => scrollTo(solutionsRef)} style={ghostBtn}>
                Se plattformen ↓
              </button>
              <button onClick={() => scrollTo(ctaRef)} style={ghostBtn}>
                Boka en demo ↓
              </button>
            </div>

            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11.5, marginTop: 14 }}>
              Ingen bindningstid • Igång på under en vecka
            </p>
          </div>
        </header>

      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* ── 2. Capabilities — spec-sheet grid, staggered reveal ──────── */}
        <Section
          innerRef={solutionsRef}
          eyebrow="Plattformen"
          title="Fyra sätt Loopr arbetar för er"
          blurb="Loopr lägger sig som ett lager runt telefonen och kundkontakten. Ni ändrar ingenting i hur ni arbetar — ni får färre missade jobb och fler omdömen."
        >
          {/* Breaks out of the page's 720px reading column: four columns need
              more room than the body copy does. Explicit breakpoints rather
              than auto-fit, so tablet lands on a true 2x2 instead of 3+1. */}
          <div
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 auto-rows-fr gap-3.5"
            style={{ width: 'min(1140px, calc(100vw - 32px))', marginLeft: '50%', transform: 'translateX(-50%)' }}
          >
            {FEATURES.map((f, i) => (
              // delay is in ms and staggers each card 120ms after the previous
              <FadeContent
                key={f.n}
                blur
                duration={1000}
                ease="power2.out"
                initialOpacity={0}
                delay={i * 120}
                style={{ display: 'flex' }}
              >
                {/* GlareHover wraps rather than replaces the Panel: it only
                    adds the sheen layer, so tilt and border-glow still work.
                    placeItems:stretch overrides its default centring so the
                    Panel fills the grid cell and all four cards match height. */}
                <GlareHover
                  width="100%"
                  height="100%"
                  background="transparent"
                  borderColor="transparent"
                  borderRadius="0.75rem"
                  glareColor="#ffffff"
                  glareOpacity={0.15}
                  glareAngle={-30}
                  glareSize={300}
                  transitionDuration={600}
                  playOnce={false}
                  style={{ cursor: 'default', placeItems: 'stretch' }}
                >
                <Panel
                  padding="p-6"
                  tiltMaxAngle={6}
                  enableStars={false}
                  glowColor={f.accent === '#C084FC' ? '192, 132, 252' : f.accent === '#8B5CF6' ? '139, 92, 246' : '168, 85, 247'}
                  className="group flex flex-col w-full h-full"
                  style={{ textAlign: 'left' }}
                >
                  <span style={{
                    fontSize: 12, fontWeight: 700, letterSpacing: '0.18em',
                    color: f.accent, display: 'block', marginBottom: 14,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {f.n}
                  </span>
                  <h3 style={{
                    fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#f6f3ee',
                    letterSpacing: '-0.01em',
                  }}>
                    {f.title}
                  </h3>
                  {/* flex:1 pushes the proof block to the bottom, so cards with
                      shorter copy (04) still line up with the rest. */}
                  <p style={{ fontSize: 13.5, lineHeight: 1.65, color: 'rgba(255,255,255,0.55)', margin: 0, flex: 1 }}>
                    {f.body}
                  </p>

                  <div style={{
                    marginTop: 18, paddingTop: 14,
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    <FeatureProofVisual kind={f.proof} accent={f.accent} />
                  </div>

                  {/* Hover reveal. Height is reserved so revealing it cannot
                      shift the grid — only the opacity changes. */}
                  <p
                    className="opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      minHeight: 28, marginTop: 10, marginBottom: 0,
                      fontSize: 11, lineHeight: 1.35, color: 'rgba(255,255,255,0.42)',
                    }}
                  >
                    {f.reveal}
                  </p>
                </Panel>
                </GlareHover>
              </FadeContent>
            ))}
          </div>

          <p style={{
            textAlign: 'center', marginTop: 20, fontSize: 11,
            color: 'rgba(255,255,255,0.3)', lineHeight: 1.5,
          }}>
            Siffrorna i korten är mål- och exempelvärden — vi har ännu inga publicerade kunddata.
          </p>

          {/* Own row with real separation: at 26px under the 11px disclaimer
              above, this read as part of the fine print and got skipped.
              Geometry matches the hero's ghost buttons so it is unmistakably a
              button, in the purple accent to mark it as the secondary action. */}
          <div style={{ textAlign: 'center', marginTop: 48 }}>
            <a
              href="/varfor-loopr"
              className="loopr-cta-link"
              style={{
                display: 'inline-block',
                color: 'var(--brick)',
                fontSize: 15.5,
                fontWeight: 700,
                textDecoration: 'none',
                border: '1px solid rgba(168,85,247,0.45)',
                background: 'rgba(168,85,247,0.12)',
                borderRadius: 18,
                padding: '15px 30px',
                cursor: 'pointer',
              }}
            >
              Läs mer om affärsnyttan <span className="loopr-cta-arrow">→</span>
            </a>
          </div>
        </Section>

        {/* ── Divider — a thin marquee, sized well below heading weight so it
            reads as a rhythm break rather than a new content block. ───────── */}
        <div style={{
          marginTop: 64,
          paddingTop: 18,
          paddingBottom: 18,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          width: 'min(1140px, calc(100vw - 32px))',
          marginLeft: '50%',
          transform: 'translateX(-50%)',
        }}>
          <ScrollVelocity
            texts={['AI-RECEPTIONIST · RECENSIONER · SMS-UPPFÖLJNING · FÖRSÄLJNING']}
            velocity={28}
            numCopies={8}
            scrollerStyle={{
              fontSize: 13,
              lineHeight: '13px',
              fontWeight: 600,
              letterSpacing: '0.22em',
              color: 'rgba(168,85,247,0.42)',
              filter: 'none',
            }}
          />
        </div>

        {/* ── 3. What a missed call costs — CountUp ─────────────────────── */}
        <Section
          eyebrow="Räkna på det"
          title="Så mycket kostar missade samtal ditt företag"
          blurb="Siffrorna nedan är en uppskattning baserad på branschsnitt för svenska servicebolag — men räkna gärna på era egna."
        >
          <FadeContent blur duration={1000} ease="power2.out" initialOpacity={0}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
              <StatCard label="Missade samtal per månad" to={MISSED_CALLS} />
              <StatCard label="Genomsnittligt ordervärde" to={ORDER_VALUE} separator=" " suffix="kr" />
              <StatCard label="Förlorad intäkt per månad" to={LOST_REVENUE} separator=" " suffix="kr" emphasis />
            </div>
          </FadeContent>

          <p style={{
            textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12.5,
            lineHeight: 1.6, marginTop: 16, maxWidth: 500, marginLeft: 'auto', marginRight: 'auto',
          }}>
            {MISSED_CALLS} missade samtal × {ORDER_VALUE.toLocaleString('sv-SE')} kr i snittorder
            = {LOST_REVENUE.toLocaleString('sv-SE')} kr som aldrig blev fakturerade.
          </p>

          <div style={{ textAlign: 'center', marginTop: 22 }}>
            <button onClick={() => scrollTo(voiceRef)} style={ghostBtn}>
              Se hur Loopr löser det ↓
            </button>
          </div>
        </Section>

        {/* ── 4. Generic voice demo ─────────────────────────────────────── */}
        <div ref={voiceRef}>
          <Section
            eyebrow="Prova själv"
            title="Ring och prata med vår AI-säljare"
            blurb="Det här är Looprs egen AI — inte en inspelning och inget påhittat företag. Fråga vad du vill om hur plattformen fungerar, vad den kostar eller hur en uppsättning går till. Samtalet är samtidigt beviset: det är precis den här tekniken era kunder möter."
          >
            {/* Restrained settings: this is the page's single most important
                interactive element, so it gets a quiet moving outline rather
                than the component's default high-chaos look. */}
            <ElectricBorder color="#A855F7" speed={0.4} chaos={0.02} borderRadius={20}>
              <VoiceDemo
                endpoint="/api/loopr-demo/voice"
                displayName="Loopr"
                ctaLabel="Starta samtalet"
                minimalIcons
              />
            </ElectricBorder>
            <p style={{
              textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 11.5, marginTop: 14,
            }}>
              Kräver mikrofon. Inget spelas in och inget sparas.
            </p>
          </Section>
        </div>

        {/* ── 5. Generic SMS demo ───────────────────────────────────────── */}
        <Section
          innerRef={smsRef}
          eyebrow="Recensionsautomation"
          title="Så får ni fler Google-recensioner"
          blurb="Ett SMS går ut automatiskt efter avslutat jobb. Klicka igenom flödet precis som er kund skulle göra."
        >
          <SmsDemo client={DEMO_SMS_CLIENT} showIntro={false} minimalIcons illustrative />
          <p style={{
            textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 11.5, marginTop: 16,
          }}>
            Exempeldata — inget SMS skickas.
          </p>
        </Section>

        {/* ── 6. How it works ───────────────────────────────────────────── */}
        <Section
          innerRef={howRef}
          eyebrow="Så fungerar det"
          title="Från första samtalet till första recensionen"
          blurb="Fyra steg. Vi gör jobbet — ni behöver inte lära er ett nytt system."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {STEPS.map(s => (
              // enableStars={false}: the default spawns drifting purple particles on
              // hover, which read as stray dots rather than decoration here.
              <Panel key={s.n} padding="p-5" enableTilt={false} enableStars={false}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <span style={{
                    minWidth: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    background: 'rgba(168,85,247,0.18)', border: '1px solid rgba(168,85,247,0.35)',
                    color: 'var(--brick)', fontSize: 14, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {s.n}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 5, color: '#f6f3ee' }}>{s.title}</h3>
                    <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.55)', margin: 0 }}>{s.body}</p>
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        </Section>

        {/* ── 7. Booking — the page's single primary action ─────────────── */}
        <Section
          innerRef={ctaRef}
          eyebrow="Nästa steg"
          titleNode={
            <GradientText
              colors={['#A855F7', '#C084FC', '#A855F7']}
              animationSpeed={5}
              className="loopr-gradient-heading"
            >
              Redo att komma igång?
            </GradientText>
          }
        >
          <FadeContent blur duration={1000} ease="power2.out" initialOpacity={0}>
            <Panel padding="p-10" enableTilt={false} enableStars={false} style={{ textAlign: 'center' }}>
              <p style={{
                color: 'rgba(255,255,255,0.62)', fontSize: 15.5, lineHeight: 1.7, marginBottom: 30,
                maxWidth: 440, marginLeft: 'auto', marginRight: 'auto',
              }}>
                Vi bygger en AI-receptionist tränad på era tjänster och visar den live innan ni
                bestämmer er. Genomgången är kostnadsfri och tar en halvtimme.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <SpecularButton
                  size="lg"
                  radius={18}
                  tint="#A855F7"
                  tintOpacity={0.15}
                  blur={0}
                  textColor="#ffffff"
                  lineColor="#A855F7"
                  baseColor="#1a1023"
                  intensity={1}
                  shineSize={10}
                  shineFade={40}
                  thickness={1}
                  speed={0.35}
                  followMouse
                  proximity={250}
                  autoAnimate={false}
                  onClick={() => startBookingContact('Boka en kostnadsfri demo av Loopr')}
                >
                  Boka en kostnadsfri demo
                </SpecularButton>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11.5, marginTop: 18 }}>
                Ingen bindningstid • Svar inom 24h
              </p>
            </Panel>
          </FadeContent>
        </Section>

        {/* ── Tech strip — a quiet trust signal, greyscale and low contrast ── */}
        <div style={{ marginTop: 72, textAlign: 'center' }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.28)', marginBottom: 18,
          }}>
            Byggt med
          </p>
          <div style={{ height: 34, opacity: 0.42 }}>
            <LogoLoop
              logos={TECH}
              speed={26}
              direction="left"
              logoHeight={22}
              gap={52}
              pauseOnHover
              scaleOnHover={false}
              fadeOut
              fadeOutColor="#0f0f0f"
              ariaLabel="Teknik som Loopr är byggt med"
              // .logoloop ships without overflow:hidden while its track is
              // width:max-content, so the copies would widen the document.
              style={{ overflow: 'hidden' }}
            />
          </div>
        </div>

        {/* ── 9. Footer — branding only, no internal links ──────────────── */}
        <footer style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 8, marginTop: 64, paddingTop: 28,
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ opacity: 0.55 }}>
            <LooprLogo size="sm" />
          </div>
          <p style={{
            fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.3)', textAlign: 'center', margin: 0,
          }}>
            AI-receptionist & recensionsautomation för lokala servicebolag
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', textDecoration: 'none', marginTop: 2 }}
          >
            {CONTACT_EMAIL}
          </a>
        </footer>
      </div>
      </div>
    </div>
  )
}
