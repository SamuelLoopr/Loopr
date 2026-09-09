'use client'

import LooprLogo from '@/app/components/LooprLogo'
import Panel from '@/app/components/Panel'
import FadeContent from '@/app/components/FadeContent'
import ProfileCard from '@/app/components/ProfileCard'
import SpecularButton from '@/app/components/SpecularButton'
import { CONTACT_EMAIL, startBookingContact } from '@/lib/contact'

// Public founder page. Calm and personal by design — no ParticleText, no
// Threads, no marquees. The ProfileCard is the only piece of motion.
//
// ISOLATION RULE: same as the other public pages. No route into the product —
// no dashboard links, no login. The only sanctioned internal links are between
// the public presentation pages (/om-loopr, /varfor-loopr, /om-grundaren).
// Everything else stays mailto:, tel: or an in-page scroll.

// Portrait, 1500x2000. ProfileCard anchors it to the bottom of the card at
// width:100%, so a portrait crop with the head in the upper half is what fits.
// AVATAR_MINI is a square head-and-shoulders crop of the same photo: the card's
// user-info bar renders it inside a 48px circle, where the full frame would
// shrink to an unreadable speck.
const AVATAR_URL = '/samuel.jpg'
const AVATAR_MINI = '/samuel-mini.jpg'

// Samuel's own words — do not rewrite, tighten or "improve" these without
// asking him first.
const STORY_PARAGRAPHS: string[] = [
  'Jag är 18 år, och det som fick mig att bygga Loopr var något jag såg om och om igen: lokala servicebolag som missar samtal helt enkelt för att de är mitt uppe i ett jobb. Elektrikern som står uppe på en stege, VVS-firman som ligger under diskbänken hos en kund — telefonen ringer, och den som ringer väntar inte. De går vidare till nästa i listan. Det är inte bristande vilja från företagens sida, det är bara omöjligt att vara på två ställen samtidigt.',
  'Under mitt utbytesår i USA såg jag hur naturligt amerikanska småföretag redan använde AI för att lösa exakt det här — svara på samtal, boka in kunder, följa upp automatiskt. Det fungerade, det var etablerat, och ingen tyckte det var konstigt. När jag kom hem till Sverige insåg jag att samma teknik knappt fanns här, särskilt inte anpassad för mindre lokala bolag. Så jag bestämde mig för att bygga den själv — på svenska, för svenska företag, redan nu istället för att vänta på att någon annan skulle göra det.',
  'Loopr är byggt specifikt för ditt bolag — inte en generisk AI-tjänst du ska klura ut själv. Du behöver inte kunna någonting alls om AI eller teknik; vi löser allt från vårt håll. Svenska hela vägen, men allt går att anpassa efter hur du faktiskt vill jobba. Det är alltid du som klient som bestämmer hur det ska fungera, inte vi.',
]

const VALUES: { heading: string; body: string }[] = [
  {
    heading: 'Byggt för dig, inte en mall',
    body: 'Loopr anpassas efter ditt bolag och hur du faktiskt vill ta emot kunder — inte tvärtom.',
  },
  {
    heading: 'Vi löser allt — du behöver inte kunna något',
    body: 'Ingen teknisk kunskap krävs. Vi sköter uppsättningen, du får ett färdigt verktyg som fungerar.',
  },
  {
    heading: 'Du bestämmer',
    body: 'Allt kan ändras och anpassas efter vad du vill. Klienten styr, alltid.',
  },
]

function Section({
  eyebrow, title, children,
}: {
  eyebrow?: string
  title?: string
  children?: React.ReactNode
}) {
  return (
    <section style={{ marginTop: 80, scrollMarginTop: 24 }}>
      {eyebrow && (
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
          color: 'var(--brick)', marginBottom: 10,
        }}>
          {eyebrow}
        </p>
      )}
      {title && (
        <h2 style={{
          fontSize: 26, fontWeight: 700, margin: '0 0 24px',
          fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: 1.25, color: '#f6f3ee',
        }}>
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}

export default function OmGrundarenPage() {
  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0f0f0f 0%, #150f1c 45%, #0f0f0f 100%)',
    padding: '0 16px 0',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#f6f3ee',
  }

  const backLink: React.CSSProperties = {
    fontSize: 12, color: 'rgba(255,255,255,0.35)', textDecoration: 'none',
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* ── Small top nav — public pages only ─────────────────────────── */}
        <nav style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, paddingTop: 28, flexWrap: 'wrap',
        }}>
          <div style={{ opacity: 0.75 }}>
            <LooprLogo size="sm" />
          </div>
          <a href="/om-loopr" className="loopr-cta-link" style={{
            fontSize: 13, fontWeight: 600, color: 'var(--brick)', textDecoration: 'none',
            border: '1px solid rgba(168,85,247,0.4)', background: 'rgba(168,85,247,0.1)',
            borderRadius: 14, padding: '9px 18px', display: 'inline-block',
          }}>
            <span className="loopr-cta-arrow" style={{ transform: 'scaleX(-1)' }}>→</span>
            {' '}Tillbaka till plattformen
          </a>
        </nav>

        {/* ── 1. Hero — card left, supporting text right ────────────────── */}
        <header style={{ paddingTop: 'clamp(36px, 7vh, 72px)', paddingBottom: 8 }}>
          <FadeContent blur duration={1000} ease="power2.out" initialOpacity={0}>
            <div style={{
              display: 'flex', gap: 44, alignItems: 'center',
              flexWrap: 'wrap', justifyContent: 'center',
            }}>
              <div style={{ flex: '0 0 auto', width: 'min(320px, 100%)' }}>
                <ProfileCard
                  className="loopr-profile-card"
                  name="Samuel Hallson"
                  title="Grundare & VD, Loopr"
                  handle="samuelhallson"
                  status="Tillgänglig"
                  contactText="Kontakta mig"
                  avatarUrl={AVATAR_URL}
                  miniAvatarUrl={AVATAR_MINI}
                  showUserInfo
                  enableTilt
                  enableMobileTilt={false}
                  onContactClick={() => startBookingContact('Hej Samuel — jag såg Loopr')}
                  behindGlowEnabled
                  behindGlowColor="rgba(168, 85, 247, 0.55)"
                  innerGradient="linear-gradient(145deg, #A855F733 0%, #C084FC22 100%)"
                />
              </div>

              <div style={{ flex: '1 1 300px', minWidth: 280, maxWidth: 430 }}>
                <p style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.16em',
                  textTransform: 'uppercase', color: 'var(--brick)', marginBottom: 12,
                }}>
                  Om grundaren
                </p>
                <h1 style={{
                  fontSize: 'clamp(28px, 4.4vw, 38px)', fontWeight: 700, margin: 0,
                  lineHeight: 1.2, fontFamily: 'Arial, Helvetica, sans-serif',
                }}>
                  Samuel Hallson
                </h1>
                <p style={{
                  color: 'var(--brick)', fontSize: 15, fontWeight: 600, marginTop: 8,
                }}>
                  Grundare &amp; VD, Loopr
                </p>
                <p style={{
                  color: 'rgba(255,255,255,0.6)', fontSize: 15.5, lineHeight: 1.7, marginTop: 18,
                }}>
                  Jag är 18 år och bygger Loopr för svenska lokala servicebolag — elektriker,
                  VVS-firmor och hantverkare som inte hinner svara i telefon mitt i ett jobb.
                  Målet är enkelt: ingen kund ska behöva ringa vidare till nästa i listan.
                </p>
              </div>
            </div>
          </FadeContent>
        </header>

        {/* ── 2. Founder story ──────────────────────────────────────────── */}
        <Section eyebrow="Bakgrund" title="Varför Loopr finns">
          <FadeContent blur duration={1000} ease="power2.out" initialOpacity={0}>
            <Panel padding="p-8" tiltMaxAngle={4} enableStars={false} style={{ textAlign: 'left' }}>
              {STORY_PARAGRAPHS.map((para, i) => (
                <p key={i} style={{
                  fontSize: 15.5, lineHeight: 1.8, margin: i === 0 ? 0 : '18px 0 0',
                  color: 'rgba(255,255,255,0.72)',
                }}>
                  {para}
                </p>
              ))}
            </Panel>
          </FadeContent>
        </Section>

        {/* ── 3. Values / mission ───────────────────────────────────────── */}
        <Section eyebrow="Löften" title="Vad du kan räkna med">
          <FadeContent blur duration={1000} ease="power2.out" initialOpacity={0}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {VALUES.map((v, i) => (
                <Panel key={i} padding="p-6" tiltMaxAngle={4} enableStars={false} style={{ textAlign: 'left' }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                    <span style={{
                      minWidth: 30, height: 30, borderRadius: 9, flexShrink: 0,
                      background: 'rgba(168,85,247,0.16)', border: '1px solid rgba(168,85,247,0.32)',
                      color: 'var(--brick)', fontSize: 12, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{
                        fontSize: 15.5, fontWeight: 700, marginBottom: 6, color: '#f6f3ee',
                      }}>
                        {v.heading}
                      </h3>
                      <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0, color: 'rgba(255,255,255,0.62)' }}>
                        {v.body}
                      </p>
                    </div>
                  </div>
                </Panel>
              ))}
            </div>
          </FadeContent>
        </Section>

        {/* ── 4. Contact ────────────────────────────────────────────────── */}
        <Section eyebrow="Kontakt">
          <FadeContent blur duration={1000} ease="power2.out" initialOpacity={0}>
            <Panel padding="p-10" enableTilt={false} enableStars={false} style={{ textAlign: 'center' }}>
              <h2 style={{
                fontSize: 24, fontWeight: 700, margin: '0 0 14px',
                fontFamily: 'Arial, Helvetica, sans-serif', color: '#f6f3ee',
              }}>
                Hör gärna av dig
              </h2>
              <p style={{
                color: 'rgba(255,255,255,0.62)', fontSize: 15, lineHeight: 1.7, marginBottom: 28,
                maxWidth: 420, marginLeft: 'auto', marginRight: 'auto',
              }}>
                Jag pratar hellre med er direkt än skickar en broschyr. Boka en genomgång så
                går vi igenom er situation tillsammans.
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
                  onClick={() => startBookingContact('Hej Samuel — jag vill boka en genomgång')}
                >
                  Boka en genomgång
                </SpecularButton>
              </div>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11.5, marginTop: 18 }}>
                Svar inom 24h
              </p>
            </Panel>
          </FadeContent>
        </Section>

        {/* ── Footer ────────────────────────────────────────────────────── */}
        <footer style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 8, marginTop: 80, paddingTop: 28, paddingBottom: 56,
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ opacity: 0.55 }}>
            <LooprLogo size="sm" />
          </div>
          <a href={`mailto:${CONTACT_EMAIL}`} style={backLink}>
            {CONTACT_EMAIL}
          </a>
          <div style={{ display: 'flex', gap: 18, marginTop: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            <a href="/om-loopr" style={backLink}>Plattformen</a>
            <a href="/varfor-loopr" style={backLink}>Affärsnyttan</a>
          </div>
        </footer>
      </div>
    </div>
  )
}
