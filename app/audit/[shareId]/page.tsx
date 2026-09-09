'use client'

import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import { AuditReport, type Audit } from '@/app/components/AuditReport'

// ─── Public page ───────────────────────────────────────────────────────────────
export default function PublicAuditPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = use(params)
  const [audit, setAudit] = useState<Audit | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    supabase
      .from('audits')
      .select('*')
      .eq('share_id', shareId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); return }
        setAudit(data)
      })
  }, [shareId])

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#888', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <p>Audit-rapporten hittades inte.</p>
        </div>
      </div>
    )
  }

  if (!audit) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#555', fontFamily: 'system-ui, sans-serif' }}>Laddar rapport...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1023 100%)', padding: '32px 16px' }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>
        <AuditReport audit={audit} isPublic />
      </div>
    </div>
  )
}
