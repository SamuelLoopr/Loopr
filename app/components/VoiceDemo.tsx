'use client'

import { useState, useRef } from 'react'

// The live ElevenLabs call panel — mic orb, status line, controls and the live
// transcript. Extracted from app/prova/[shareId] so the standalone voice demo
// and the Master Demo one-pager run the exact same call logic and visuals
// instead of two drifting copies.
//
// The conversation is started through /api/public-agent/[shareId] (POST), which
// is what holds the ElevenLabs key — nothing here talks to ElevenLabs directly.

type CallStatus = 'idle' | 'connecting' | 'connected'

const cardStyle: React.CSSProperties = {
  backgroundColor: 'rgba(21,19,19,0.85)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 20,
  backdropFilter: 'blur(8px)',
}

export default function VoiceDemo({
  shareId,
  displayName,
  ctaLabel = '🎙 Prata med vår AI-receptionist',
  endpoint,
  minimalIcons = false,
}: {
  /** Public share id of the agent. Omit when passing an explicit `endpoint`. */
  shareId?: string
  displayName: string
  ctaLabel?: string
  /**
   * POST target that returns { signedUrl, prompt, welcomeMessage, language,
   * voiceId }. Defaults to this agent's public route; the generic Loopr demo
   * page points it at a route with no agent behind it.
   */
  endpoint?: string
  /**
   * Swaps the orb's emoji glyphs for single-stroke SVG marks. Opt-in so the
   * per-customer demo pages keep the friendlier emoji look unchanged.
   */
  minimalIcons?: boolean
}) {
  const startUrl = endpoint ?? `/api/public-agent/${shareId}`
  const [callStatus, setCallStatus] = useState<CallStatus>('idle')
  const [callMode, setCallMode] = useState<'listening' | 'speaking'>('listening')
  const [callError, setCallError] = useState('')
  const [transcript, setTranscript] = useState<{ text: string; source: 'user' | 'ai' }[]>([])
  const convRef = useRef<{ endSession: () => Promise<void> } | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  const isLive = callStatus === 'connected'

  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const MicMark = () => (
    <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </svg>
  )
  const WaveMark = () => (
    <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M3 12h2M7 8v8M11 5v14M15 8.5v7M19 11h2" />
    </svg>
  )
  const ListenMark = () => (
    <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <rect x="2.5" y="13" width="5" height="7" rx="2" />
      <rect x="16.5" y="13" width="5" height="7" rx="2" />
    </svg>
  )
  const DotsMark = () => (
    <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" />
    </svg>
  )

  const orbGlyph = minimalIcons
    ? (callStatus === 'connecting' ? <DotsMark /> : isLive ? (callMode === 'speaking' ? <WaveMark /> : <ListenMark />) : <MicMark />)
    : (callStatus === 'connecting' ? '⏳' : isLive ? (callMode === 'speaking' ? '🔊' : '🎧') : '🎙')

  async function startCall() {
    setCallStatus('connecting')
    setTranscript([])
    setCallError('')

    try {
      const res = await fetch(startUrl, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kunde inte starta samtalet')

      await navigator.mediaDevices.getUserMedia({ audio: true })

      const { Conversation } = await import('@11labs/client')
      const voiceIdValid = !!data.voiceId && /^[a-zA-Z0-9]{18,24}$/.test(data.voiceId)

      const conv = await Conversation.startSession({
        signedUrl: data.signedUrl,
        overrides: {
          agent: {
            ...(data.prompt ? { prompt: { prompt: data.prompt } } : {}),
            ...(data.welcomeMessage ? { firstMessage: data.welcomeMessage } : {}),
            language: data.language === 'en' ? 'en' : 'sv',
          },
          ...(voiceIdValid ? { tts: { voiceId: data.voiceId } } : {}),
        },
        onConnect: () => setCallStatus('connected'),
        onDisconnect: () => { setCallStatus('idle'); convRef.current = null },
        onError: (msg: string) => {
          setCallError(msg)
          setCallStatus('idle')
          convRef.current = null
        },
        onMessage: ({ message, source }: { message: string; source: 'user' | 'ai' }) => {
          setTranscript(prev => {
            const next = [...prev, { text: message, source }]
            setTimeout(() => transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
            return next
          })
        },
        onModeChange: ({ mode }: { mode: 'listening' | 'speaking' }) => setCallMode(mode),
      })
      convRef.current = conv
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setCallStatus('idle')
      setCallError(
        message.includes('Permission') || message.includes('denied')
          ? 'Mikrofonen blockerades. Tillåt mikrofonåtkomst i webbläsaren och försök igen.'
          : message
      )
    }
  }

  async function endCall() {
    try {
      if (convRef.current) {
        await convRef.current.endSession()
        convRef.current = null
      }
    } catch { /* ignore cleanup errors */ }
    setCallStatus('idle')
    setCallMode('listening')
  }

  return (
    <>
      {/* Call panel */}
      <div style={{
        ...cardStyle,
        padding: '28px',
        textAlign: 'center',
        background: isLive ? 'rgba(168,85,247,0.1)' : 'rgba(21,19,19,0.85)',
        borderColor: isLive ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.1)',
        transition: 'background 0.4s ease, border-color 0.4s ease',
      }}>
        {/* Mic orb */}
        <div style={{
          width: 92, height: 92, borderRadius: '50%', margin: '0 auto 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 38,
          background: isLive
            ? (callMode === 'speaking' ? 'rgba(168,85,247,0.28)' : 'rgba(74,222,128,0.18)')
            : 'rgba(255,255,255,0.05)',
          border: `2px solid ${isLive
            ? (callMode === 'speaking' ? 'rgba(168,85,247,0.6)' : 'rgba(74,222,128,0.5)')
            : 'rgba(255,255,255,0.12)'}`,
          boxShadow: isLive
            ? `0 0 0 ${callMode === 'speaking' ? '14px' : '8px'} ${callMode === 'speaking' ? 'rgba(168,85,247,0.10)' : 'rgba(74,222,128,0.07)'}`
            : 'none',
          transition: 'all 0.35s ease',
          animation: isLive ? 'looprPulse 2s ease-in-out infinite' : 'none',
        }}>
          {orbGlyph}
        </div>

        {/* Status line */}
        <p style={{
          fontSize: 14, fontWeight: 600, marginBottom: 4,
          color: isLive ? (callMode === 'speaking' ? 'var(--brick)' : '#4ade80') : 'var(--cream)',
        }}>
          {callStatus === 'connecting' && 'Kopplar upp…'}
          {isLive && (callMode === 'speaking' ? `${displayName} pratar…` : 'Lyssnar — prata på!')}
          {callStatus === 'idle' && 'Redo att prata'}
        </p>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>
          {callStatus === 'idle'
            ? 'Samtalet sker direkt i webbläsaren — inget behöver installeras.'
            : 'Prata som du skulle göra i ett vanligt telefonsamtal.'}
        </p>

        {callStatus === 'idle' && (
          <button
            onClick={startCall}
            style={{
              background: 'var(--brick)', color: 'white', border: 'none',
              borderRadius: 12, padding: '15px 32px', fontSize: 16, fontWeight: 700,
              cursor: 'pointer', boxShadow: '0 6px 22px rgba(168,85,247,0.35)',
            }}
          >
            {ctaLabel}
          </button>
        )}
        {callStatus === 'connecting' && (
          <button disabled style={{
            background: 'rgba(255,255,255,0.06)', color: 'var(--slate)',
            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
            padding: '15px 32px', fontSize: 16, fontWeight: 700, cursor: 'not-allowed',
          }}>
            Kopplar upp…
          </button>
        )}
        {isLive && (
          <button
            onClick={endCall}
            style={{
              background: 'rgba(239,68,68,0.15)', color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12,
              padding: '13px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ✕ Avsluta samtal
          </button>
        )}

        {callError && (
          <div style={{
            marginTop: 18, padding: 12, borderRadius: 10, fontSize: 13,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444',
          }}>
            ⚠️ {callError}
          </div>
        )}
      </div>

      {/* Live transcript */}
      {(isLive || transcript.length > 0) && (
        <div style={{ ...cardStyle, padding: '20px 22px', marginTop: 16 }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.35)', marginBottom: 14,
          }}>
            Live-transkript
          </p>
          {transcript.length === 0 ? (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '12px 0' }}>
              Väntar på att samtalet ska börja…
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
              {transcript.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: item.source === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '80%', padding: '9px 13px', borderRadius: 14, fontSize: 13, lineHeight: 1.5,
                    background: item.source === 'user' ? 'rgba(168,85,247,0.18)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${item.source === 'user' ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.1)'}`,
                    color: item.source === 'user' ? 'var(--cream)' : 'rgba(255,255,255,0.85)',
                  }}>
                    <span style={{
                      display: 'block', fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                      opacity: 0.5, marginBottom: 3,
                    }}>
                      {item.source === 'user' ? 'Du' : displayName}
                    </span>
                    {item.text}
                  </div>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>
      )}
    </>
  )
}
