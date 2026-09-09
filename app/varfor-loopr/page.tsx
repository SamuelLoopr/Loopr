'use client'

import { useRef } from 'react'
import LooprLogo from '@/app/components/LooprLogo'
import Panel from '@/app/components/Panel'
import CountUp from '@/app/components/CountUp'
import FadeContent from '@/app/components/FadeContent'
import ScrollFloat from '@/app/components/ScrollFloat'
import ShinyText from '@/app/components/ShinyText'
import GradualBlur from '@/app/components/GradualBlur'
import SpecularButton from '@/app/components/SpecularButton'
import { CONTACT_EMAIL, startBookingContact } from '@/lib/contact'

// Public business-case page for Loopr — the ROI argument for a decision maker.
// Product capabilities live on /om-loopr; this page is deliberately quieter:
// no ParticleText, no Threads, no WebGL background. Text and numbers only.
//
// ISOLATION RULE: same as /om-loopr. No route into the product — no dashboard
// links, no login. The ONE sanctioned internal link is the pair /om-loopr <->
// /varfor-loopr, since both are public presentation pages. Everything else must
// stay mailto:, tel: or an in-page scroll.

// Every figure below is an industry estimate, not measured customer data — we
// have none yet (zero review_requests, zero audits in the database). The
// footnote under each number says so on screen. Do not promote these to
// outcome claims without real data behind them.
const BENEFITS: {
  n: string
  heading: string
  value: number
  suffix: string
  prefix?: string
  metric: string
  body: string
  accent: string
}[] = [
  {
    n: '01',
    heading: 'Ökad omsättning',
    value: 23,
    prefix: '+',
    suffix: '%',
    metric: 'fler bokade jobb',
    body:
      'Ungefär vart fjärde samtal till ett litet servicebolag går obesvarat — och den som ringer går vidare till nästa firma i listan. När varje samtal besvaras direkt blir en del av de förlorade samtalen bokade jobb i stället. Det är samma marknadsföringsbudget, samma kunder, men färre som faller mellan stolarna.',
    accent: '#A855F7',
  },
  {
    n: '02',
    heading: 'Starkare varumärke',
    value: 4,
    prefix: '×',
    suffix: '',
    metric: 'fler recensioner per månad',
    body:
      'Nöjda kunder skriver sällan omdömen spontant — de behöver bli tillfrågade vid rätt tillfälle. Automatisk uppföljning direkt efter avslutat jobb höjer både betyg och antal recensioner, vilket i sin tur styr var ni hamnar i Googles lokala sökresultat. Fler recensioner ger fler visningar, och fler visningar ger fler förfrågningar.',
    accent: '#C084FC',
  },
  {
    n: '03',
    heading: 'Frigjord tid',
    value: 6,
    suffix: 'h',
    metric: 'mindre telefontid per vecka',
    body:
      'Att svara i telefon mitt i ett jobb kostar mer än de minuter samtalet tar — det bryter koncentrationen och förlänger arbetsdagen. När AI-receptionisten tar samtalet, samlar in ärendet och lämnar ett färdigt underlag, kan ni ringa tillbaka när det passar i stället för att avbryta det ni håller på med.',
    accent: '#8B5CF6',
  },
]

const COMPARISON: { without: string; with: string }[] = [
  {
    without: 'Ett samtal kommer in fredag 16:40. Ingen svarar — telefonen ligger i bilen.',
    with: 'Samtalet besvaras direkt, ärendet skrivs ner och en tid föreslås.',
  },
  {
    without: 'Kunden ringer nästa firma i söklistan och bokar där i stället.',
    with: 'Ni har ett färdigt underlag att ringa upp på måndag morgon.',
  },
  {
    without: 'Jobbet blir klart. Ingen hinner be om en recension.',
    with: 'Ett SMS går ut automatiskt när jobbet är avslutat.',
  },
  {
    without: 'Google-sidan står kvar på samma fyra omdömen som förra året.',
    with: 'Nöjda kunder leds till Google, missnöjda till er egen inkorg.',
  },
  {
    without: 'Ett missat samtal från i tisdags ligger kvar obesvarat i loggen.',
    with: 'Missade samtal följs upp med SMS inom minuter, utan att någon tänker på det.',
  },
]

function Section({
  eyebrow, children, innerRef,
}: {
  eyebrow?: string
  children?: React.ReactNode
  innerRef?: React.Ref<HTMLDivElement>
}) {
  return (
    <section ref={innerRef} style={{ marginTop: 84, scrollMarginTop: 24 }}>
      {eyebrow && (
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--brick)', marginBottom: 10, textAlign: 'center',
        }}>
          {eyebrow}
        </p>
      )}
      {children}
    </section>
  )
}

export default function VarforLooprPage() {
  const benefitsRef = useRef<HTMLDivElement>(null)
  const ctaRef = useRef<HTMLDivElement>(null)

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) =>
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    // Calmer than /om-loopr: a flat gradient, no animated canvas layers.
    background: 'linear-gradient(180deg, #0f0f0f 0%, #150f1c 45%, #0f0f0f 100%)',
    padding: '0 16px 0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#f6f3ee',
    position: 'relative',
  }

  const ghostBtn: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)', color: 'var(--cream)',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 18, padding: '14px 28px', fontSize: 15, fontWeight: 700,
    cursor: 'pointer', textDecoration: 'none', display: 'inline-block',
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* ── 1. Hero ───────────────────────────────────────────────────── */}
        <header style={{
          minHeight: '72vh',
          display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center',
          textAlign: 'center', paddingTop: 'clamp(48px, 10vh, 110px)', paddingBottom: 32,
        }}>
          <div style={{ opacity: 0.8, marginBottom: 30 }}>
            <LooprLogo size="md" />
          </div>

          <h1 style={{
            fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 700, margin: 0, lineHeight: 1.18,
            fontFamily: 'Arial, Helvetica, sans-serif',
          }}>
            <ShinyText
              text="Fler jobb."
              color="#8b5cf6"
              shineColor="#ffffff"
              speed={3.5}
            />
            {' '}Fler recensioner.<br />Mindre administration.
          </h1>

          <p style={{
            color: 'rgba(255,255,255,0.6)', fontSize: 'clamp(15px, 1.8vw, 17px)',
            lineHeight: 1.65, marginTop: 20, maxWidth: 520,
          }}>
            Loopr är inte ett verktyg till i högen — det är färre tappade affärer.
            Här är räkningen bakom, för dig som ska fatta beslutet.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 30 }}>
            <button onClick={() => scrollTo(benefitsRef)} style={ghostBtn}>
              Se affärsnyttan ↓
            </button>
            <a href="/om-loopr" style={ghostBtn}>
              Se plattformen →
            </a>
          </div>
        </header>

        {/* ── 2. Three business benefits ────────────────────────────────── */}
        <div ref={benefitsRef}>
          {BENEFITS.map((b, i) => (
            <Section key={b.n} eyebrow={`${b.n} — Affärsnytta`}>
              <FadeContent blur duration={1000} ease="power2.out" initialOpacity={0}>
                {/* ScrollFloat renders its own h2; textClassName overrides its
                    very large default type scale so it reads as a heading. */}
                <ScrollFloat
                  animationDuration={1}
                  ease="back.inOut(2)"
                  scrollStart="center bottom+=30%"
                  scrollEnd="bottom bottom-=20%"
                  stagger={0.03}
                  containerClassName="varfor-float"
                  textClassName="varfor-float-text"
                >
                  {b.heading}
                </ScrollFloat>

                <Panel
                  padding="p-8"
                  tiltMaxAngle={4}
                  enableStars={false}
                  glowColor={b.accent === '#C084FC' ? '192, 132, 252' : b.accent === '#8B5CF6' ? '139, 92, 246' : '168, 85, 247'}
                  style={{ marginTop: 18, textAlign: 'left' }}
                >
                  <p style={{
                    fontSize: 'clamp(38px, 6vw, 54px)', fontWeight: 700, lineHeight: 1,
                    margin: 0, color: b.accent, fontFamily: 'Arial, Helvetica, sans-serif',
                  }}>
                    {b.prefix}
                    <CountUp from={0} to={b.value} duration={1} direction="up" />
                    {b.suffix}
                  </p>
                  <p style={{
                    fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.45)', marginTop: 12, marginBottom: 20,
                  }}>
                    {b.metric}
                  </p>
                  <p style={{
                    fontSize: 15, lineHeight: 1.75, color: 'rgba(255,255,255,0.62)', margin: 0,
                  }}>
                    {b.body}
                  </p>
                  <p style={{
                    fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 18, marginBottom: 0,
                  }}>
                    Branschuppskattning — inte uppmätt kunddata.
                  </p>
                </Panel>
              </FadeContent>
            </Section>
          ))}
        </div>

        {/* ── 3. Before / after ─────────────────────────────────────────── */}
        <Section eyebrow="En vanlig vecka">
          <FadeContent blur duration={1000} ease="power2.out" initialOpacity={0}>
            <h2 style={{
              fontSize: 26, fontWeight: 700, textAlign: 'center', margin: '0 0 28px',
              fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: 1.25, color: '#f6f3ee',
            }}>
              Samma vecka, med och utan Loopr
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Panel padding="p-6" tiltMaxAngle={4} enableStars={false} style={{ textAlign: 'left' }}>
                <p style={{
                  fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.4)', marginBottom: 18,
                }}>
                  Utan Loopr
                </p>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {COMPARISON.map((row, i) => (
                    <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <span style={{
                        width: 14, height: 1.5, background: 'rgba(255,255,255,0.25)',
                        flexShrink: 0, marginTop: 9, display: 'block',
                      }} />
                      <span style={{ fontSize: 13.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.5)' }}>
                        {row.without}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel
                padding="p-6"
                tiltMaxAngle={4}
                enableStars={false}
                style={{
                  textAlign: 'left',
                  background: 'rgba(168,85,247,0.06)',
                  borderColor: 'rgba(168,85,247,0.25)',
                }}
              >
                <p style={{
                  fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
                  color: 'var(--brick)', marginBottom: 18,
                }}>
                  Med Loopr
                </p>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {COMPARISON.map((row, i) => (
                    <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"
                        style={{ flexShrink: 0, marginTop: 3 }}
                        fill="none" stroke="var(--brick)" strokeWidth="2.4"
                        strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12.5l5.5 5.5L20 6.5" />
                      </svg>
                      <span style={{ fontSize: 13.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.72)' }}>
                        {row.with}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </FadeContent>
        </Section>

        {/* ── 4. Customer proof — deliberately empty until it is real ───── */}
        <Section eyebrow="Kundcase">
          <FadeContent blur duration={1000} ease="power2.out" initialOpacity={0}>
            <Panel padding="p-8" enableTilt={false} enableStars={false} style={{ textAlign: 'center' }}>
              <p style={{
                fontSize: 17, fontWeight: 700, color: '#f6f3ee', margin: '0 0 10px',
                fontFamily: 'Arial, Helvetica, sans-serif',
              }}>
                Kommer snart: vad våra kunder säger
              </p>
              <p style={{
                fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,0.5)',
                margin: '0 auto', maxWidth: 440,
              }}>
                Vi publicerar inga omdömen förrän vi har riktiga att visa. Vill du se
                plattformen i drift innan dess går det bra att boka en genomgång — då
                visar vi den live i stället.
              </p>
            </Panel>
          </FadeContent>
        </Section>

        {/* ── 5. Closing CTA — same pattern and helper as /om-loopr ─────── */}
        <Section eyebrow="Nästa steg" innerRef={ctaRef}>
          <FadeContent blur duration={1000} ease="power2.out" initialOpacity={0}>
            <h2 style={{
              fontSize: 26, fontWeight: 700, textAlign: 'center', margin: '0 0 24px',
              fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: 1.25, color: '#f6f3ee',
            }}>
              Räkna på det tillsammans med oss
            </h2>
            <Panel padding="p-10" enableTilt={false} enableStars={false} style={{ textAlign: 'center' }}>
              <p style={{
                color: 'rgba(255,255,255,0.62)', fontSize: 15.5, lineHeight: 1.7, marginBottom: 30,
                maxWidth: 440, marginLeft: 'auto', marginRight: 'auto',
              }}>
                Vi går igenom era samtalsvolymer och visar vad Loopr skulle betyda i
                kronor för just er verksamhet. Kostnadsfritt och tar en halvtimme.
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
                  onClick={() => startBookingContact('Boka en genomgång av affärsnyttan med Loopr')}
                >
                  Boka en kostnadsfri genomgång
                </SpecularButton>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11.5, marginTop: 18 }}>
                Ingen bindningstid • Svar inom 24h
              </p>
            </Panel>
          </FadeContent>
        </Section>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <footer style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 8, marginTop: 84, paddingTop: 28, paddingBottom: 56,
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ opacity: 0.55 }}>
            <LooprLogo size="sm" />
          </div>
          <p style={{
            fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.3)', textAlign: 'center', margin: 0,
          }}>
            AI-receptionist &amp; recensionsautomation för lokala servicebolag
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', textDecoration: 'none', marginTop: 2 }}
          >
            {CONTACT_EMAIL}
          </a>
          <a
            href="/om-loopr"
            style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', textDecoration: 'none', marginTop: 6 }}
          >
            Se plattformen och produktdemona →
          </a>
        </footer>
      </div>

      {/* The before/after columns fit without scrolling, so GradualBlur is used
          as a page-level fade into the background just above the footer rather
          than as a scroll-box mask. */}
      <GradualBlur
        target="page"
        position="bottom"
        height="6rem"
        strength={2}
        divCount={5}
        curve="bezier"
        exponential
        opacity={1}
      />
    </div>
  )
}
