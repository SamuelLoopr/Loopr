'use client'

import { useState, useEffect } from 'react'
import Panel from '@/app/components/Panel'

// The simulated phone + SMS review flow. Extracted from app/demo/[shareId] so
// the standalone SMS demo and the Master Demo one-pager share one implementation
// of the phone chrome, the bubbles and the looprMsgIn / looprTypingDot beats.

type Phase = 'sms' | 'rating' | 'google' | 'feedback' | 'thanks'

const DEMO_CUSTOMER = 'Anna'

// Fixed clock so the mocked phone chrome doesn't drift while you sit on the
// page, and so the message timestamps stay consistent with it.
const DEMO_CLOCK = '14:32'
const DEMO_MSG_TIME = '14:32'

// The DB default for message_template only applies to rows created through the
// Review Automation form; rows created elsewhere can carry NULL, so the demo
// falls back rather than crashing on .replace() of null.
const DEFAULT_TEMPLATE =
  'Hej {{kund_namn}}, tack för att du valde {{företag}}! Vi skulle uppskatta en snabb recension på Google: {{review_url}}'

export interface SmsDemoClient {
  business_name: string
  google_review_url: string | null
  delay_minutes: number | null
  message_template: string | null
}

export default function SmsDemo({
  client,
  showIntro = true,
  minimalIcons = false,
  illustrative = false,
}: {
  client: SmsDemoClient
  showIntro?: boolean
  /**
   * Swaps the emoji stars and celebration glyphs for single-stroke SVG marks.
   * Opt-in so the per-customer demo pages keep their existing look unchanged.
   */
  minimalIcons?: boolean
  /**
   * Marks the flow as a non-functional example: the Google CTA stops being a
   * real link (so a shared page has no dead-end outbound click) and the review
   * URL is labelled as an example.
   */
  illustrative?: boolean
}) {
  const [phase, setPhase] = useState<Phase>('sms')
  const [hoveredStar, setHoveredStar] = useState(0)
  const [selectedStar, setSelectedStar] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // The SMS "arrives" after a short typing indicator instead of just being
  // there on load — that beat is what makes the simulation read as real.
  const [smsArrived, setSmsArrived] = useState(false)

  useEffect(() => {
    if (smsArrived) return
    const t = setTimeout(() => setSmsArrived(true), 1600)
    return () => clearTimeout(t)
  }, [smsArrived])

  const reviewUrl = client.google_review_url || 'https://g.page'
  const smsText = (client.message_template || DEFAULT_TEMPLATE)
    .replace(/\{\{kund_namn\}\}/g, DEMO_CUSTOMER)
    .replace(/\{\{företag\}\}/g, client.business_name)
    .replace(/\{\{review_url\}\}/g, reviewUrl)

  function handleStarClick(star: number) {
    setSelectedStar(star)
    setPhase(star === 5 ? 'google' : 'feedback')
  }

  function handleFeedbackSubmit() {
    setSubmitted(true)
    setTimeout(() => setPhase('thanks'), 800)
  }

  const StarMark = ({ filled, size = 30 }: { filled: boolean; size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth={1.5} strokeLinejoin="round">
      <path d="M12 3.5l2.6 5.75 6.15.62-4.6 4.16 1.3 6.07L12 16.9l-5.45 3.2 1.3-6.07-4.6-4.16 6.15-.62z" />
    </svg>
  )

  const showReply = phase === 'google' || phase === 'feedback' || phase === 'thanks'

  return (
    <div style={{ width: '100%', maxWidth: 400, margin: '0 auto' }}>
      {showIntro && (
        <p style={{
          textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 12,
          lineHeight: 1.6, marginBottom: 18,
        }}>
          Så här ser det ut för din kund{' '}
          <strong style={{ color: 'var(--brick)' }}>{client.delay_minutes ?? 30} min</strong> efter avslutat jobb.
        </p>
      )}

      {/* Phone */}
      <Panel padding="p-0" tiltMaxAngle={4} className="overflow-hidden" style={{ borderRadius: 26 }}>
        {/* Status bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 18px 5px', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.75)',
        }}>
          <span>{DEMO_CLOCK}</span>
          <span style={{ letterSpacing: '1px' }}>▮▮▮ ᯤ 􀛨</span>
        </div>

        {/* Conversation header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 18, lineHeight: 1 }}>‹</span>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(168,85,247,0.18)', border: '1px solid rgba(168,85,247,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, color: 'var(--brick)',
          }}>
            {client.business_name.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{
              color: '#f6f3ee', fontSize: 13, fontWeight: 600, margin: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {client.business_name}
            </p>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, margin: 0 }}>SMS</p>
          </div>
        </div>

        {/* Thread */}
        <div style={{ padding: '16px 14px 4px', minHeight: 150 }}>
          <p style={{
            textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 10,
            fontWeight: 600, marginBottom: 14,
          }}>
            Idag {DEMO_MSG_TIME}
          </p>

          {!smsArrived ? (
            /* Typing indicator */
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'rgba(255,255,255,0.07)',
                borderRadius: '18px 18px 18px 5px',
                padding: '13px 16px',
              }}>
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="loopr-typing-dot"
                    style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.7)',
                      display: 'inline-block',
                      animationDelay: `${i * 0.18}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Incoming message from the business */}
              <div className="loopr-msg-in" style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  maxWidth: '82%',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '18px 18px 18px 5px',
                  padding: '11px 14px',
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  color: '#ece8e2',
                  wordBreak: 'break-word',
                }}>
                  {smsText}
                </div>
              </div>
              <p style={{
                fontSize: 10, color: 'rgba(255,255,255,0.28)',
                margin: '5px 0 0 6px',
              }}>
                {DEMO_MSG_TIME} · Levererat
              </p>

              {/* Outgoing "reply" once the customer has rated */}
              {showReply && (
                <div style={{ marginTop: 14 }}>
                  <div className="loopr-msg-in" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{
                      maxWidth: '82%',
                      background: 'var(--brick)',
                      borderRadius: '18px 18px 5px 18px',
                      padding: '10px 14px',
                      fontSize: 14,
                      color: 'white',
                      letterSpacing: '1px',
                      display: 'flex', gap: 2, alignItems: 'center',
                    }}>
                      {minimalIcons
                        ? Array.from({ length: selectedStar }, (_, i) => <StarMark key={i} filled size={16} />)
                        : '⭐'.repeat(selectedStar)}
                    </div>
                  </div>
                  <p style={{
                    fontSize: 10, color: 'rgba(255,255,255,0.28)',
                    margin: '5px 6px 0 0', textAlign: 'right',
                  }}>
                    {DEMO_MSG_TIME} · Läst
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Interaction area — the tapped-through experience */}
        <div style={{
          padding: '14px 16px 18px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          marginTop: 12,
        }}>
          {phase === 'sms' && (
            <button
              onClick={() => setPhase('rating')}
              disabled={!smsArrived}
              style={{
                width: '100%',
                background: smsArrived ? 'var(--brick)' : 'rgba(255,255,255,0.06)',
                color: smsArrived ? 'white' : 'rgba(255,255,255,0.3)',
                border: 'none',
                borderRadius: 12,
                padding: '13px 0',
                fontSize: 14.5,
                fontWeight: 700,
                cursor: smsArrived ? 'pointer' : 'default',
                boxShadow: smsArrived ? '0 5px 18px rgba(168,85,247,0.3)' : 'none',
                transition: 'all 0.3s ease',
              }}
            >
              {smsArrived ? 'Tryck på länken →' : 'Väntar på SMS…'}
            </button>
          )}

          {phase === 'rating' && (
            <div className="loopr-step-in" style={{ textAlign: 'center' }}>
              <p style={{ color: '#f6f3ee', fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>
                Hej {DEMO_CUSTOMER}! Hur var din upplevelse?
              </p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 16 }}>
                Tryck på en stjärna
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 14 }}>
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    onMouseEnter={() => setHoveredStar(star)}
                    onMouseLeave={() => setHoveredStar(0)}
                    onClick={() => handleStarClick(star)}
                    aria-label={`${star} stjärnor`}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 32,
                      padding: 2,
                      lineHeight: 1,
                      transition: 'transform 0.15s ease, filter 0.15s ease',
                      transform: hoveredStar >= star ? 'scale(1.18)' : 'scale(1)',
                      filter: hoveredStar >= star || selectedStar >= star ? 'none' : 'grayscale(1) opacity(0.35)',
                      color: minimalIcons ? 'var(--gold)' : undefined,
                      display: 'flex', alignItems: 'center',
                    }}
                  >
                    {minimalIcons
                      ? <StarMark filled={hoveredStar >= star || selectedStar >= star} />
                      : '⭐'}
                  </button>
                ))}
              </div>
              <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 10.5, lineHeight: 1.5 }}>
                5 stjärnor → Google-recension · 1–4 → privat feedback
              </p>
            </div>
          )}

          {phase === 'google' && (
            <div className="loopr-step-in" style={{ textAlign: 'center' }}>
              {!minimalIcons && <div style={{ fontSize: 34, marginBottom: 8 }}>🎉</div>}
              <h2 style={{ color: '#f6f3ee', fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                Tack för 5 stjärnor!
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
                Kan du ta en minut och lämna en recension på Google? Det hjälper oss enormt!
              </p>
              {illustrative ? (
                <button
                  onClick={() => setPhase('thanks')}
                  style={{
                    display: 'block', width: '100%', border: 'none',
                    background: '#4285F4', color: 'white', borderRadius: 12,
                    padding: '13px 0', fontSize: 14.5, fontWeight: 700,
                    cursor: 'pointer', marginBottom: 6,
                  }}
                >
                  Lämna Google-recension
                </button>
              ) : (
                <a
                  href={reviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    background: '#4285F4',
                    color: 'white',
                    borderRadius: 12,
                    padding: '13px 0',
                    fontSize: 14.5,
                    fontWeight: 700,
                    textDecoration: 'none',
                    marginBottom: 10,
                  }}
                  onClick={() => setTimeout(() => setPhase('thanks'), 1500)}
                >
                  Lämna Google-recension
                </a>
              )}
              {illustrative && (
                <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: 10.5, marginBottom: 10 }}>
                  Exempelknapp — leder ingenstans
                </p>
              )}
              <button
                onClick={() => setPhase('thanks')}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 12.5, cursor: 'pointer' }}
              >
                Hoppa över
              </button>
            </div>
          )}

          {phase === 'feedback' && (
            <div className="loopr-step-in">
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <p style={{ color: '#f6f3ee', fontSize: 14.5, fontWeight: 700, marginBottom: 4 }}>
                  Tack för din feedback!
                </p>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12.5, lineHeight: 1.5 }}>
                  Vad kunde vi gjort bättre? Din feedback är privat och hamnar aldrig på Google.
                </p>
              </div>
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Skriv din feedback här…"
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#e8e4df',
                  borderRadius: 12,
                  padding: '11px 13px',
                  fontSize: 13.5,
                  outline: 'none',
                  resize: 'vertical',
                  minHeight: 84,
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  marginBottom: 10,
                }}
              />
              <button
                onClick={handleFeedbackSubmit}
                disabled={!feedback.trim() || submitted}
                style={{
                  width: '100%',
                  background: submitted ? 'rgba(74,222,128,0.18)' : 'var(--brick)',
                  color: submitted ? '#4ade80' : 'white',
                  border: submitted ? '1px solid rgba(74,222,128,0.35)' : 'none',
                  borderRadius: 12,
                  padding: '13px 0',
                  fontSize: 14.5,
                  fontWeight: 700,
                  cursor: feedback.trim() && !submitted ? 'pointer' : 'default',
                  opacity: !feedback.trim() ? 0.45 : 1,
                  transition: 'all 0.3s ease',
                }}
              >
                {submitted ? '✓ Skickat' : 'Skicka feedback'}
              </button>
            </div>
          )}

          {phase === 'thanks' && (
            <div className="loopr-step-in" style={{ textAlign: 'center', padding: '8px 0' }}>
              {!minimalIcons && <div style={{ fontSize: 42, marginBottom: 10 }}>🙏</div>}
              <h2 style={{ color: '#f6f3ee', fontSize: 17, fontWeight: 700, marginBottom: 6 }}>
                Tack, {DEMO_CUSTOMER}!
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 1.55 }}>
                Vi uppskattar att du tog dig tid. Ha en fortsatt bra dag!
              </p>
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}
