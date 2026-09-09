'use client'

import { useState, useEffect, useRef } from 'react'
import Panel from '@/app/components/Panel'
import AgentPicker from '@/app/components/AgentPicker'
import { supabase } from '@/lib/supabase'
import { AuditReport } from '@/app/components/AuditReport'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Audit {
  id: string
  business_name: string
  website_url: string
  share_id: string
  status: string
  content: Record<string, unknown>
  created_at: string
}

const inputStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'var(--cream)',
  borderRadius: '8px',
  padding: '8px 12px',
  width: '100%',
  fontSize: '14px',
  outline: 'none',
}

// ─── New Audit Modal ───────────────────────────────────────────────────────────
function NewAuditModal({ onClose, onCreated }: { onClose: () => void; onCreated: (a: Audit) => void }) {
  const [businessName, setBusinessName] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [agentId, setAgentId] = useState('')
  const [leadId, setLeadId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [stage, setStage] = useState('')

  async function handleGenerate() {
    if (!businessName.trim() || !websiteUrl.trim()) { setError('Båda fälten krävs'); return }
    setGenerating(true)
    setError('')
    setStage('Hämtar webbplatsinnehåll...')

    try {
      await new Promise(r => setTimeout(r, 600))
      setStage('Analyserar med Claude AI...')
      const res = await fetch('/api/generate-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: businessName.trim(),
          websiteUrl: websiteUrl.trim(),
          agentId: agentId || null,
          leadId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generering misslyckades')
      setStage('Sparar rapport...')
      await new Promise(r => setTimeout(r, 200))
      onCreated(data.audit)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setGenerating(false)
      setStage('')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-md mx-4">
        <Panel enableTilt={false}>
          <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--cream)' }}>Ny Audit</h2>
          <div className="space-y-4 mb-5">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Företagsnamn</label>
              <input
                style={inputStyle}
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                placeholder="Ex. Rörmokarna VVS AB"
                disabled={generating}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Webbplats-URL</label>
              <input
                style={inputStyle}
                value={websiteUrl}
                onChange={e => setWebsiteUrl(e.target.value)}
                placeholder="https://rormokar.se"
                disabled={generating}
              />
            </div>
            <div className="sm:col-span-2">
              <AgentPicker value={agentId} onChange={(a, l) => { setAgentId(a); setLeadId(l) }} />
            </div>
          </div>

          {generating && (
            <div className="mb-4 rounded-lg p-3" style={{ background: 'rgba(201,162,75,0.1)', border: '1px solid rgba(201,162,75,0.2)' }}>
              <div className="flex items-center gap-2">
                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⚙</span>
                <span className="text-sm" style={{ color: 'var(--gold)' }}>{stage}</span>
              </div>
            </div>
          )}

          {error && <p className="text-sm mb-4" style={{ color: 'var(--brick)' }}>{error}</p>}

          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={generating}
              style={{ color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
            >
              Avbryt
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'var(--brick)', color: 'white', opacity: generating ? 0.6 : 1 }}
            >
              {generating ? 'Genererar...' : '🔎 Generera Audit'}
            </button>
          </div>
        </Panel>
      </div>
    </div>
  )
}

// ─── Audit Card ────────────────────────────────────────────────────────────────
function AuditCard({
  audit,
  onView,
  onDelete,
}: {
  audit: Audit
  onView: () => void
  onDelete: () => void
}) {
  const [copied, setCopied] = useState(false)

  function copyLink() {
    const shareUrl = `${window.location.origin}/audit/${audit.share_id}`
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Panel className="flex flex-col gap-3" tiltMaxAngle={6}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold truncate" style={{ color: 'var(--cream)' }}>{audit.business_name}</h3>
          <a
            href={audit.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs block truncate"
            style={{ color: 'var(--gold)', textDecoration: 'none' }}
          >
            {audit.website_url} ↗
          </a>
        </div>
        <span
          className="shrink-0 px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}
        >
          ✓ Completed
        </span>
      </div>

      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
        {new Date(audit.created_at).toLocaleDateString('sv-SE')}
      </p>

      <div className="flex gap-2 flex-wrap pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          onClick={onView}
          className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          View
        </button>
        <a
          href={`/audit/${audit.share_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ background: 'rgba(201,162,75,0.12)', color: 'var(--gold)', border: '1px solid rgba(201,162,75,0.3)', textDecoration: 'none', display: 'inline-block' }}
        >
          Share page ↗
        </a>
        <button
          onClick={copyLink}
          className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{
            background: copied ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.05)',
            color: copied ? '#4ade80' : 'var(--slate)',
            border: `1px solid ${copied ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)'}`,
          }}
        >
          {copied ? '✓ Kopierad' : 'Copy link'}
        </button>
        <button
          onClick={onDelete}
          className="px-3 py-1.5 rounded-lg text-xs font-medium ml-auto"
          style={{ background: 'rgba(168,85,247,0.1)', color: 'var(--brick)', border: '1px solid rgba(168,85,247,0.25)' }}
        >
          Delete
        </button>
      </div>
    </Panel>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AiAuditMakerPage() {
  const [audits, setAudits] = useState<Audit[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [viewAudit, setViewAudit] = useState<Audit | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadAudits() }, [])

  async function loadAudits() {
    setLoading(true)
    const { data } = await supabase.from('audits').select('*').order('created_at', { ascending: false })
    setAudits(data ?? [])
    setLoading(false)
  }

  function handleCreated(audit: Audit) {
    setAudits(prev => [audit, ...prev])
    setShowNew(false)
    setViewAudit(audit)
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  async function handleDelete(audit: Audit) {
    await supabase.from('audits').delete().eq('id', audit.id)
    setAudits(prev => prev.filter(a => a.id !== audit.id))
    if (viewAudit?.id === audit.id) setViewAudit(null)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <Panel padding="px-5 py-3" className="inline-block" enableTilt={false}>
          <p className="text-xs tracking-widest" style={{ color: 'var(--brick)' }}>AI & AUTOMATION</p>
          <h1
            className="text-3xl font-bold mt-1"
            style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}
          >
            🔎 AI Audit Maker
          </h1>
        </Panel>
        <button
          onClick={() => { setViewAudit(null); setShowNew(true) }}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ backgroundColor: 'var(--brick)', color: 'white' }}
        >
          + New Audit
        </button>
      </div>

      {/* Detail view */}
      {viewAudit && (
        <div ref={detailRef}>
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setViewAudit(null)}
              className="text-sm px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--slate)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              ← Tillbaka till lista
            </button>
          </div>
          <AuditReport audit={viewAudit as Parameters<typeof AuditReport>[0]['audit']} />
        </div>
      )}

      {/* Audit list */}
      {!viewAudit && (
        <>
          {loading && <Panel enableTilt={false}><p style={{ color: 'var(--slate)' }}>Laddar audits...</p></Panel>}

          {!loading && audits.length === 0 && (
            <Panel className="text-center py-16" tiltMaxAngle={4}>
              <div className="text-5xl mb-4">🔎</div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--cream)' }}>Inga audits ännu</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>
                Ange ett företagsnamn och webbplats — Claude analyserar sidan och genererar en säljklar rapport.
              </p>
              <button
                onClick={() => setShowNew(true)}
                className="px-5 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: 'var(--brick)', color: 'white' }}
              >
                + New Audit
              </button>
            </Panel>
          )}

          {!loading && audits.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {audits.map(audit => (
                <AuditCard
                  key={audit.id}
                  audit={audit}
                  onView={() => setViewAudit(audit)}
                  onDelete={() => handleDelete(audit)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {showNew && <NewAuditModal onClose={() => setShowNew(false)} onCreated={handleCreated} />}
    </div>
  )
}
