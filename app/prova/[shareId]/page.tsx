'use client'

import { useState, useEffect, use } from 'react'
import LooprLogo from '@/app/components/LooprLogo'
import VoiceDemo from '@/app/components/VoiceDemo'

interface PublicAgent {
  agentName: string
  businessName: string | null
  industry: string | null
  description: string | null
  services: string | null
  status: string | null
}

export default function ProvaAgentPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = use(params)

  const [agent, setAgent] = useState<PublicAgent | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/public-agent/${shareId}`)
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { setNotFound(true); return }
        setAgent(data)
      })
      .catch(() => setNotFound(true))
  }, [shareId])

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1023 55%, #0f0f0f 100%)',
    padding: '40px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#f6f3ee',
  }

  const cardStyle: React.CSSProperties = {
    backgroundColor: 'rgba(21,19,19,0.85)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 20,
    backdropFilter: 'blur(8px)',
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

  if (!agent) {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#555' }}>Laddar demo…</p>
      </div>
    )
  }

  const displayName = agent.businessName || agent.agentName
  const serviceList = (agent.services ?? '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 4)

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 620, margin: '0 auto' }}>

        {/* Intro line */}
        <p style={{
          textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.5)',
          marginBottom: 20, lineHeight: 1.6,
        }}>
          Det här är en riktig AI-receptionist tränad specifikt för{' '}
          <strong style={{ color: 'var(--brick)' }}>{displayName}</strong> — testa den själv.
        </p>

        {/* Business card */}
        <div style={{ ...cardStyle, padding: '32px 28px', textAlign: 'center', marginBottom: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18, margin: '0 auto 16px',
            background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30,
          }}>
            📞
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, fontFamily: 'Arial, Helvetica, sans-serif' }}>
            {displayName}
          </h1>
          {agent.industry && (
            <p style={{ color: 'var(--gold)', fontSize: 13, marginTop: 6 }}>{agent.industry}</p>
          )}
          {agent.description && (
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
              {agent.description}
            </p>
          )}

          {serviceList.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 16 }}>
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
        </div>

        <VoiceDemo shareId={shareId} displayName={displayName} />

        {/* Loopr footer branding */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 6, marginTop: 36, opacity: 0.55,
        }}>
          <LooprLogo size="sm" />
          <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
            AI-receptionist byggd med Loopr
          </p>
        </div>
      </div>
    </div>
  )
}
