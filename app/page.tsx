'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import FadeContent from '@/app/components/FadeContent'
import CountUp from '@/app/components/CountUp'

// Public landing page for tryloopr.se.
//
// This route used to redirect('/dashboard'). It is now the marketing front
// door; the dashboard keeps its own URL and middleware still guards it. Nothing
// behind the login was touched.
//
// ── A NOTE ON THE SOCIAL PROOF ───────────────────────────────────────────────
// The brief asked for "X kr closed by people like you" and "4.9 out of 5
// stars". There is one account in the database, `invoices` has zero rows, and
// there is no review system — so both of those would be invented claims about
// customers who do not exist yet, on a live commercial site. They are replaced
// here with figures derived from the product's own Profit Calculator, which are
// true statements about what Loopr charges and yields rather than claims about
// past results. Every such slot is marked REPLACE-WITH-REAL-DATA below so the
// real numbers can drop straight in once they exist.

const ACCENT = '#A855F7'

// From TIER_PRICING / the Profit Calculator default on Skicka Betalningar:
// an operator bills roughly 1 499 kr per client per month.
const PRICE_PER_CLIENT = 1499
const EXAMPLE_CLIENTS = 15

type BuildChoice = 'agent' | 'bos'

const STEPS = [
  { key: 'valj', label: 'Välj' },
  { key: 'bygg', label: 'Bygg' },
  { key: 'forhandsgranska', label: 'Förhandsgranska' },
  { key: 'salj', label: 'Sälj' },
]

const FAQS = [
  {
    q: 'Hur snabbt kan jag få min första kund?',
    a: 'Du kan bygga en färdig demo åt ett lokalt företag på en kvart — leta upp företaget i Lead Finder, låt AI:n generera receptionisten och skicka den delbara demolänken. Hur snabbt det blir en affär beror på dig, men du behöver inte vänta på utveckling, uppsättning eller en teknisk leverans.',
  },
  {
    q: 'Behöver jag erfarenhet?',
    a: 'Du behöver ingen teknisk bakgrund. Loopr genererar prompten, rösten och demon åt dig. Det du bidrar med är kontakten med lokala företag — själva säljsamtalet. Utbildningsmodulen i plattformen går igenom manus och invändningar.',
  },
  {
    q: 'Vad kostar det?',
    a: 'Loopr kostar från 499 kr per månad för Basic, 1 499 kr för Pro och 3 999 kr för Business. Planerna skiljer sig i hur många klienter och AI-agenter du kan driva samtidigt. Se alla nivåer på prissidan.',
    href: '/uppgradera',
    linkLabel: 'Se planerna →',
  },
  {
    q: 'Kan jag skala förbi en enda kund?',
    a: 'Det är hela poängen. Varje kund är en egen AI-agent med egen prompt, röst och telefonnummer, och de körs parallellt från samma konto. Pro-planen rymmer 15 samtidiga klienter, Business obegränsat — du bygger en byrå, inte ett enskilt uppdrag.',
  },
]

// ── Small building blocks ────────────────────────────────────────────────────

function GridBackdrop() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
        maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%)',
      }}
    />
  )
}

function CtaButton({ label = 'Lansera din AI-byrå', href = '/login' }: { label?: string; href?: string }) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '15px 30px',
        borderRadius: 16,
        fontSize: 16,
        fontWeight: 700,
        color: '#fff',
        textDecoration: 'none',
        background: `linear-gradient(135deg, ${ACCENT} 0%, #7C3AED 100%)`,
        boxShadow: '0 14px 36px rgba(168,85,247,0.3)',
      }}
    >
      {label}
      <span aria-hidden="true">→</span>
    </Link>
  )
}

/** Initials rather than photographs: stand-in faces would imply named customers who do not exist yet. */
function OperatorAvatars() {
  const initials = ['SH', 'MK', 'AL', 'JN', 'EP']
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {initials.map((t, i) => (
        <div
          key={t}
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            marginLeft: i === 0 ? 0 : -11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.75)',
            background: `linear-gradient(135deg, rgba(168,85,247,${0.4 - i * 0.05}) 0%, rgba(124,58,237,0.25) 100%)`,
            border: '1px solid rgba(255,255,255,0.14)',
            zIndex: initials.length - i,
          }}
        >
          {t}
        </div>
      ))}
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        borderRadius: 16,
        backgroundColor: 'rgba(21,19,19,0.72)',
        border: '1px solid rgba(255,255,255,0.1)',
        padding: 18,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function SectionHeading({ eyebrow, title, blurb }: { eyebrow: string; title: string; blurb?: string }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 34 }}>
      <p style={{ fontSize: 11, letterSpacing: '0.16em', color: ACCENT, margin: 0 }}>{eyebrow}</p>
      <h2
        style={{
          fontSize: 'clamp(24px, 3.4vw, 34px)',
          fontWeight: 700,
          margin: '10px 0 0',
          color: 'var(--cream)',
          fontFamily: 'Arial, Helvetica, sans-serif',
          lineHeight: 1.2,
        }}
      >
        {title}
      </h2>
      {blurb && (
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.6,
            color: 'rgba(255,255,255,0.45)',
            maxWidth: 560,
            margin: '12px auto 0',
          }}
        >
          {blurb}
        </p>
      )}
    </div>
  )
}

// ── Step mock-ups: miniatures of screens that exist in the product ───────────

function StepChooseBusiness() {
  // Mirrors Lead Finder's result cards, including the ICP score badge.
  const results = [
    { name: 'Vasa Viktoria Tandvård', addr: 'Vasagatan 12, Stockholm', score: 92 },
    { name: 'Smile Dental Group', addr: 'Kungsgatan 44, Stockholm', score: 78 },
    { name: 'Norrmalms Tandklinik', addr: 'Odengatan 3, Stockholm', score: 61 },
  ]
  const color = (s: number) => (s >= 80 ? '#4ade80' : s >= 60 ? 'var(--gold)' : 'var(--slate)')

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '9px 12px',
          borderRadius: 10,
          backgroundColor: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          marginBottom: 13,
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 13 }}>🔍</span>
        <span style={{ fontSize: 13.5, color: 'var(--cream)' }}>Tandläkare i Stockholm</span>
      </div>

      {results.map(r => (
        <div
          key={r.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '10px 0',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)', margin: 0 }}>{r.name}</p>
            <p style={{ fontSize: 11, color: 'var(--slate)', margin: '2px 0 0' }}>{r.addr}</p>
          </div>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12.5,
              fontWeight: 700,
              border: `2px solid ${color(r.score)}`,
              color: color(r.score),
            }}
          >
            {r.score}
          </div>
        </div>
      ))}
    </Card>
  )
}

function StepAgentBuilds() {
  const turns = [
    { who: 'ai', text: 'Vasa Viktoria Tandvård, det är Maja. Hur kan jag hjälpa dig?' },
    { who: 'user', text: 'Hej, jag skulle vilja boka en tid för undersökning.' },
    { who: 'ai', text: 'Absolut. Vi har en tid på torsdag klockan 14, passar det?' },
    { who: 'user', text: 'Det funkar bra.' },
    { who: 'ai', text: 'Toppen — då är du inbokad torsdag 14:00. Du får en bekräftelse via SMS.' },
  ]
  const [shown, setShown] = useState(1)

  useEffect(() => {
    if (shown >= turns.length) return
    const t = setTimeout(() => setShown(s => s + 1), 1400)
    return () => clearTimeout(t)
  }, [shown, turns.length])

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
        <span
          style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', display: 'block' }}
          aria-hidden="true"
        />
        <span style={{ fontSize: 11, color: 'var(--slate)' }}>Pågående samtal · svenska</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 210 }}>
        {turns.slice(0, shown).map((t, i) => (
          <div
            key={i}
            style={{
              alignSelf: t.who === 'ai' ? 'flex-start' : 'flex-end',
              maxWidth: '86%',
              padding: '9px 12px',
              borderRadius: 13,
              fontSize: 12.5,
              lineHeight: 1.5,
              color: t.who === 'ai' ? 'var(--cream)' : 'rgba(255,255,255,0.7)',
              backgroundColor: t.who === 'ai' ? 'rgba(168,85,247,0.16)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${t.who === 'ai' ? 'rgba(168,85,247,0.28)' : 'rgba(255,255,255,0.09)'}`,
              animation: 'looprMsgIn 0.4s cubic-bezier(0.2,0.8,0.3,1) both',
            }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Card>
  )
}

function StepProposal() {
  // Same status vocabulary the Förslag module uses.
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 10, letterSpacing: '0.14em', color: ACCENT, margin: 0 }}>FÖRSLAG</p>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--cream)', margin: '6px 0 2px' }}>
            AI-lösning för Vasa Viktoria Tandvård
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--slate)', margin: 0 }}>Skickad 14 sep</p>
        </div>
        <span
          style={{
            flexShrink: 0,
            fontSize: 10,
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: 999,
            color: '#4ade80',
            backgroundColor: 'rgba(74,222,128,0.12)',
            border: '1px solid rgba(74,222,128,0.3)',
          }}
        >
          ACCEPTERAT
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 18,
          marginTop: 16,
          paddingTop: 14,
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {[
          { label: 'Månadsvärde', value: `${PRICE_PER_CLIENT.toLocaleString('sv-SE')} kr` },
          { label: 'Status', value: 'Visat → Accepterat' },
        ].map(s => (
          <div key={s.label}>
            <p style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--slate)', margin: 0 }}>
              {s.label.toUpperCase()}
            </p>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)', margin: '4px 0 0' }}>{s.value}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

function StepRevenue() {
  // REPLACE-WITH-REAL-DATA: an illustration of the arithmetic, not a record of
  // anyone's results. The curve is the shape of adding roughly two clients a
  // month at the plan's own price — no customer data is claimed.
  const months = ['Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep']
  const clients = [2, 4, 7, 9, 12, 15]
  const max = Math.max(...clients)
  const w = 240
  const h = 68
  const pts = clients
    .map((c, i) => `${(i / (clients.length - 1)) * w},${h - (c / max) * h}`)
    .join(' ')

  return (
    <Card>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--slate)', margin: 0 }}>AKTIVA KLIENTER</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--cream)', margin: '3px 0 0', fontFamily: 'Arial, Helvetica, sans-serif' }}>
            <CountUp to={EXAMPLE_CLIENTS} duration={1.4} />
          </p>
        </div>
        <div>
          <p style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--slate)', margin: 0 }}>SNITTABONNEMANG</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--cream)', margin: '3px 0 0', fontFamily: 'Arial, Helvetica, sans-serif' }}>
            {PRICE_PER_CLIENT.toLocaleString('sv-SE')} kr
          </p>
        </div>
        <div>
          <p style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--slate)', margin: 0 }}>MÅNADSINTÄKT</p>
          <p style={{ fontSize: 22, fontWeight: 700, color: '#4ade80', margin: '3px 0 0', fontFamily: 'Arial, Helvetica, sans-serif' }}>
            <CountUp to={EXAMPLE_CLIENTS * PRICE_PER_CLIENT} duration={1.6} separator=" " /> kr
          </p>
        </div>
      </div>

      <svg viewBox={`0 0 ${w} ${h + 6}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }} aria-hidden="true">
        <polyline points={pts} fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {clients.map((c, i) => (
          <circle key={i} cx={(i / (clients.length - 1)) * w} cy={h - (c / max) * h} r="3" fill={ACCENT} />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {months.map(m => (
          <span key={m} style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.3)' }}>{m}</span>
        ))}
      </div>
      <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.28)', margin: '10px 0 0', lineHeight: 1.45 }}>
        Räkneexempel vid {PRICE_PER_CLIENT.toLocaleString('sv-SE')} kr per klient och månad. Inte historiska resultat.
      </p>
    </Card>
  )
}

const JOURNEY = [
  { n: 1, title: 'Välj ett företag', blurb: 'Sök upp lokala företag och låt AI:n poängsätta dem mot din idealkundprofil. Samma Lead Finder som finns i plattformen.', Mock: StepChooseBusiness },
  { n: 2, title: 'AI bygger en agent', blurb: 'Prompt, röst och hälsningsfras genereras utifrån företagets verksamhet. Agenten svarar på svenska och bokar tider.', Mock: StepAgentBuilds },
  { n: 3, title: 'Skicka förslag', blurb: 'En delbar länk med demo och prisförslag. Du ser när kunden öppnat den och när den accepterats.', Mock: StepProposal },
  { n: 4, title: 'Tjäna återkommande intäkt', blurb: 'Varje accepterad kund blir ett månadsabonnemang. Agenterna körs parallellt från samma konto.', Mock: StepRevenue },
]

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [choice, setChoice] = useState<BuildChoice>('agent')
  const [activeStep, setActiveStep] = useState(0)
  const stepRefs = useRef<(HTMLDivElement | null)[]>([])

  // Drives the progress bar from whichever step is currently in view, so the
  // header tracks the scroll rather than a timer the reader cannot control.
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const i = stepRefs.current.findIndex(el => el === e.target)
            if (i >= 0) setActiveStep(i)
          }
        })
      },
      { rootMargin: '-45% 0px -45% 0px' }
    )
    stepRefs.current.forEach(el => el && obs.observe(el))
    return () => obs.disconnect()
  }, [])

  const wrap: React.CSSProperties = { maxWidth: 1080, margin: '0 auto', padding: '0 20px', position: 'relative', zIndex: 1 }

  return (
    <main style={{ position: 'relative', paddingBottom: 80 }}>
      <GridBackdrop />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section style={{ ...wrap, paddingTop: 'clamp(56px, 11vh, 104px)', textAlign: 'center' }}>
        <h1
          style={{
            fontSize: 'clamp(34px, 6.4vw, 66px)',
            fontWeight: 700,
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            margin: 0,
            color: 'var(--cream)',
            fontFamily: 'Arial, Helvetica, sans-serif',
          }}
        >
          Bygg en AI-byrå
          <br />
          <span style={{ color: ACCENT }}>utan att skriva en rad kod</span>
        </h1>

        <p
          style={{
            fontSize: 'clamp(15px, 1.8vw, 18px)',
            lineHeight: 1.6,
            color: 'rgba(255,255,255,0.5)',
            maxWidth: 580,
            margin: '20px auto 0',
          }}
        >
          Loopr ger dig verktygen att hitta lokala företag, bygga en AI-receptionist åt dem
          på minuter och sälja den som ett månadsabonnemang.
        </p>

        {/* REPLACE-WITH-REAL-DATA: states what the product charges, not what
            anyone has earned. Swap for a real aggregate when there is one. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 13,
            flexWrap: 'wrap',
            margin: '26px 0 28px',
          }}
        >
          <OperatorAvatars />
          <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.55)', margin: 0, textAlign: 'left' }}>
            <strong style={{ color: 'var(--cream)' }}>
              {(EXAMPLE_CLIENTS * PRICE_PER_CLIENT).toLocaleString('sv-SE')} kr/mån
            </strong>{' '}
            är vad {EXAMPLE_CLIENTS} klienter ger en operatör
          </p>
        </div>

        <CtaButton />

        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.35)', marginTop: 14 }}>
          14 dagars provperiod · inget kort krävs för att komma igång
        </p>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section style={{ ...wrap, paddingTop: 96 }}>
        <SectionHeading
          eyebrow="SÅ FUNGERAR DET"
          title="Från okänt företag till betalande kund"
          blurb="Fyra steg, alla i samma plattform. Du behöver inte lämna Loopr någonstans i kedjan."
        />

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 30 }}>
          {STEPS.map((s, i) => {
            const done = i <= activeStep
            return (
              <div key={s.key} style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    height: 3,
                    borderRadius: 2,
                    backgroundColor: done ? ACCENT : 'rgba(255,255,255,0.1)',
                    transition: 'background-color 0.4s',
                  }}
                />
                {/* Wraps rather than truncates: at 375px each column is 78px
                    wide, which cuts "Förhandsgranska" to "Förhandsgra…".
                    Two short lines read better than an elided word. */}
                <p
                  style={{
                    fontSize: 10.5,
                    lineHeight: 1.25,
                    margin: '8px 0 0',
                    color: done ? 'var(--cream)' : 'var(--slate)',
                    transition: 'color 0.4s',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {s.label}
                </p>
              </div>
            )
          })}
        </div>

        {/* Choice */}
        <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--cream)', textAlign: 'center', marginBottom: 16 }}>
          Vad vill du bygga idag?
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 14,
            marginBottom: 56,
          }}
        >
          {([
            { id: 'agent' as const, icon: '🤖', title: 'En AI-agent', blurb: 'En receptionist som svarar i telefon, bokar möten och kopplar vidare.' },
            { id: 'bos' as const, icon: '⚡', title: 'Ett operativsystem', blurb: 'Hela paketet åt ett företag: receptionist, recensioner och uppföljning.' },
          ]).map(c => {
            const on = choice === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setChoice(c.id)}
                aria-pressed={on}
                style={{
                  textAlign: 'left',
                  padding: 18,
                  borderRadius: 16,
                  cursor: 'pointer',
                  backgroundColor: on ? 'rgba(168,85,247,0.1)' : 'rgba(21,19,19,0.7)',
                  border: `1px solid ${on ? 'rgba(168,85,247,0.45)' : 'rgba(255,255,255,0.1)'}`,
                  transition: 'background-color 0.25s, border-color 0.25s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                  <span style={{ fontSize: 19 }} aria-hidden="true">{c.icon}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--cream)' }}>{c.title}</span>
                  {on && <span style={{ marginLeft: 'auto', color: ACCENT, fontSize: 14 }} aria-hidden="true">✓</span>}
                </div>
                <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'rgba(255,255,255,0.45)', margin: 0 }}>{c.blurb}</p>
              </button>
            )
          })}
        </div>

        {/* Journey */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 64 }}>
          {JOURNEY.map((step, i) => {
            const { Mock } = step
            return (
              <div
                key={step.n}
                ref={el => { stepRefs.current[i] = el }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 28,
                  alignItems: 'center',
                }}
              >
                <FadeContent duration={700} delay={60} blur>
                  <div>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 30,
                        height: 30,
                        borderRadius: 9,
                        fontSize: 13,
                        fontWeight: 700,
                        color: ACCENT,
                        backgroundColor: 'rgba(168,85,247,0.14)',
                        border: '1px solid rgba(168,85,247,0.3)',
                      }}
                    >
                      {step.n}
                    </span>
                    <h3
                      style={{
                        fontSize: 'clamp(19px, 2.4vw, 25px)',
                        fontWeight: 700,
                        color: 'var(--cream)',
                        margin: '14px 0 8px',
                        fontFamily: 'Arial, Helvetica, sans-serif',
                      }}
                    >
                      {step.title}
                    </h3>
                    <p style={{ fontSize: 14.5, lineHeight: 1.65, color: 'rgba(255,255,255,0.48)', margin: 0 }}>
                      {step.blurb}
                    </p>
                  </div>
                </FadeContent>

                <FadeContent duration={800} delay={160} blur>
                  <Mock />
                </FadeContent>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section style={{ ...wrap, paddingTop: 100, maxWidth: 780 }}>
        <SectionHeading eyebrow="VANLIGA FRÅGOR" title="Det folk brukar undra" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FAQS.map(f => (
            <details
              key={f.q}
              style={{
                borderRadius: 14,
                backgroundColor: 'rgba(21,19,19,0.7)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '15px 18px',
              }}
            >
              <summary
                style={{
                  cursor: 'pointer',
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--cream)',
                  listStyle: 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 14,
                  alignItems: 'center',
                }}
              >
                {f.q}
                <span style={{ color: ACCENT, flexShrink: 0, fontSize: 17 }} aria-hidden="true">+</span>
              </summary>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,0.5)', margin: '12px 0 0' }}>
                {f.a}
              </p>
              {f.href && (
                <Link href={f.href} style={{ display: 'inline-block', fontSize: 13.5, color: ACCENT, marginTop: 10 }}>
                  {f.linkLabel}
                </Link>
              )}
            </details>
          ))}
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────────── */}
      <section style={{ ...wrap, paddingTop: 100, textAlign: 'center' }}>
        <h2
          style={{
            fontSize: 'clamp(26px, 4.4vw, 42px)',
            fontWeight: 700,
            lineHeight: 1.15,
            color: 'var(--cream)',
            margin: '0 0 22px',
            fontFamily: 'Arial, Helvetica, sans-serif',
          }}
        >
          Redo att börja tjäna
          <br />
          <span style={{ color: ACCENT }}>återkommande intäkt?</span>
        </h2>
        <CtaButton />
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.26)', marginTop: 30 }}>
          Varje missat samtal är en kund som ringde någon annan.
        </p>
      </section>
    </main>
  )
}
