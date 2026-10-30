'use client'

import { useState, useEffect, use } from 'react'
import LooprLogo from '@/app/components/LooprLogo'
import SmsDemo, { type SmsDemoClient } from '@/app/components/SmsDemo'

export default function DemoPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = use(params)
  const [client, setClient] = useState<SmsDemoClient | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    // Via servern (app/api/public/review-demo), inte direkt mot databasen.
    fetch(`/api/public/review-demo/${encodeURIComponent(shareId)}`)
      .then(res => (res.ok ? res.json() : null))
      .then(body => {
        if (!body?.client) { setNotFound(true); return }
        setClient(body.client)
      })
      .catch(() => setNotFound(true))
  }, [shareId])

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1023 55%, #0f0f0f 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '28px 14px 32px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  }

  if (notFound) {
    return (
      <div style={{ ...pageStyle, justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#aaa' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>⚠️</div>
          <p style={{ fontSize: 15 }}>Demo-sidan hittades inte.</p>
        </div>
      </div>
    )
  }

  if (!client) {
    return (
      <div style={{ ...pageStyle, justifyContent: 'center' }}>
        <p style={{ color: '#666', fontSize: 14 }}>Laddar demo…</p>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      {/* Demo badge */}
      <div style={{
        position: 'fixed',
        top: 12,
        right: 12,
        background: 'rgba(168,85,247,0.9)',
        color: 'white',
        fontSize: 10,
        fontWeight: 700,
        padding: '5px 11px',
        borderRadius: 20,
        letterSpacing: '0.06em',
        zIndex: 10,
        boxShadow: '0 4px 14px rgba(168,85,247,0.3)',
      }}>
        DEMO — inget SMS skickas
      </div>

      <div style={{ width: '100%', maxWidth: 400 }}>
        <SmsDemo client={client} />

        {/* Loopr footer branding — same pattern as /prova/[shareId] */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 6, marginTop: 28, opacity: 0.55,
        }}>
          <LooprLogo size="sm" />
          <p style={{
            fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.3)', textAlign: 'center',
          }}>
            Recensionsautomation med Loopr
          </p>
        </div>
      </div>
    </div>
  )
}
