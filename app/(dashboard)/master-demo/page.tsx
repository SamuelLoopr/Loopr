'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Panel from '@/app/components/Panel'
import Dropdown from '@/app/components/Dropdown'
import { supabase } from '@/lib/supabase'

// The Master Demo is keyed on the agent, because that is what carries
// public_share_id and what audits / review_clients / proposals link back to via
// agent_id. Each row here is therefore one agent, shown with the lead it belongs
// to so it still reads as "a client you can build a demo for".

interface Row {
  agentId: string
  agentName: string
  businessName: string | null
  leadName: string | null
  leadBusiness: string | null
  shareId: string | null
  hasAudit: boolean
  hasSms: boolean
  hasProposal: boolean
}

type Readiness = 'ready' | 'partial' | 'none'

function readiness(r: Row): Readiness {
  if (!r.shareId) return 'none'
  return r.hasAudit && r.hasSms && r.hasProposal ? 'ready' : 'partial'
}

const STATUS: Record<Readiness, { color: string; bg: string; border: string }> = {
  ready:   { color: '#4ade80',      bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.3)' },
  partial: { color: 'var(--gold)',  bg: 'rgba(201,162,75,0.12)',  border: 'rgba(201,162,75,0.3)' },
  none:    { color: 'var(--slate)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)' },
}

// Naming the gap is more actionable than a generic "Saknar data" — the user can
// see from the list alone which agent needs what.
function missingParts(r: Row): string[] {
  const gaps: string[] = []
  if (!r.hasSms) gaps.push('SMS')
  if (!r.hasAudit) gaps.push('Audit')
  if (!r.hasProposal) gaps.push('Förslag')
  return gaps
}

function statusLabel(r: Row): string {
  const state = readiness(r)
  if (state === 'ready') return 'Master Demo klar'
  if (state === 'none') return 'Ej skapad'
  return `Saknar: ${missingParts(r).join(', ')}`
}

const FILTERS = [
  { value: 'all',     label: 'Alla' },
  { value: 'ready',   label: 'Master Demo klar' },
  { value: 'partial', label: 'Saknar data' },
  { value: 'none',    label: 'Ej skapad' },
]

export default function MasterDemoListPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    async function load() {
      const { data: agents, error: agentErr } = await supabase
        .from('agents')
        .select('id, name, business_name, lead_id, public_share_id')
        .order('created_at', { ascending: false })

      if (agentErr) { setError(agentErr.message); setLoading(false); return }

      const agentIds = (agents ?? []).map(a => a.id)
      const leadIds = (agents ?? []).map(a => a.lead_id).filter(Boolean) as string[]

      const [leadsRes, auditsRes, smsRes, propRes] = await Promise.all([
        leadIds.length
          ? supabase.from('leads').select('id, name, business').in('id', leadIds)
          : Promise.resolve({ data: [] as { id: string; name: string | null; business: string | null }[] }),
        agentIds.length
          ? supabase.from('audits').select('agent_id').in('agent_id', agentIds)
          : Promise.resolve({ data: [] as { agent_id: string }[] }),
        agentIds.length
          ? supabase.from('review_clients').select('agent_id').in('agent_id', agentIds)
          : Promise.resolve({ data: [] as { agent_id: string }[] }),
        agentIds.length
          ? supabase.from('proposals').select('agent_id').in('agent_id', agentIds)
          : Promise.resolve({ data: [] as { agent_id: string }[] }),
      ])

      const leadById = new Map((leadsRes.data ?? []).map(l => [l.id, l]))
      const has = (res: { data: { agent_id: string | null }[] | null }) =>
        new Set((res.data ?? []).map(r => r.agent_id).filter(Boolean) as string[])

      const auditSet = has(auditsRes)
      const smsSet = has(smsRes)
      const propSet = has(propRes)

      setRows((agents ?? []).map(a => {
        const lead = a.lead_id ? leadById.get(a.lead_id) : undefined
        return {
          agentId: a.id,
          agentName: a.name,
          businessName: a.business_name,
          leadName: lead?.name ?? null,
          leadBusiness: lead?.business ?? null,
          shareId: a.public_share_id,
          hasAudit: auditSet.has(a.id),
          hasSms: smsSet.has(a.id),
          hasProposal: propSet.has(a.id),
        }
      }))
      setLoading(false)
    }
    load()
  }, [])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'all' && readiness(r) !== filter) return false
      if (!q) return true
      return [r.agentName, r.businessName, r.leadName, r.leadBusiness]
        .filter(Boolean)
        .some(v => (v as string).toLowerCase().includes(q))
    })
  }, [rows, query, filter])

  const readyCount = rows.filter(r => readiness(r) === 'ready').length

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <p className="text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--brick)' }}>
          Showcase
        </p>
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--cream)', fontFamily: 'Arial, Helvetica, sans-serif' }}>
          🖥 Master Demo
        </h1>
        <p className="text-sm" style={{ color: 'var(--slate)' }}>
          En enda länk som visar allt Loopr gör för en kund — röstdemo, recensionsflöde,
          synlighetsanalys och förslag på samma sida.
        </p>
      </div>

      {/* Search + filter */}
      <Panel padding="p-4" enableTilt={false} className="mb-5">
        <div className="flex gap-3 flex-wrap items-center">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Sök på klient, företag eller agent…"
            className="flex-1 min-w-[220px]"
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--cream)',
              borderRadius: 8,
              padding: '9px 13px',
              fontSize: 14,
              outline: 'none',
            }}
          />
          <Dropdown value={filter} onChange={setFilter} options={FILTERS} style={{ minWidth: 190 }} />
          <span className="text-xs shrink-0" style={{ color: 'var(--slate)' }}>
            {readyCount} av {rows.length} klara
          </span>
        </div>
      </Panel>

      {error && (
        <Panel padding="p-4" enableTilt={false} className="mb-5">
          <p className="text-xs" style={{ color: '#ef4444' }}>⚠️ {error}</p>
        </Panel>
      )}

      {/* Gallery */}
      {loading ? (
        <Panel padding="p-10" enableTilt={false}>
          <p className="text-sm text-center" style={{ color: 'var(--slate)' }}>Laddar klienter…</p>
        </Panel>
      ) : visible.length === 0 ? (
        <Panel padding="p-10" enableTilt={false}>
          <p className="text-sm text-center" style={{ color: 'var(--slate)' }}>
            {rows.length === 0
              ? 'Inga AI-agenter än — skapa en receptionist först, så kan du bygga en Master Demo för den.'
              : 'Ingen klient matchar din sökning.'}
          </p>
        </Panel>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {visible.map(r => {
            const state = readiness(r)
            const s = STATUS[state]
            const title = r.businessName || r.leadBusiness || r.agentName
            const parts = [
              { label: 'Röstdemo', ok: Boolean(r.shareId) },
              { label: 'SMS-flöde', ok: r.hasSms },
              { label: 'Audit', ok: r.hasAudit },
              { label: 'Förslag', ok: r.hasProposal },
            ]

            return (
              <Panel key={r.agentId} padding="p-5" tiltMaxAngle={4} className="flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="shrink-0 flex items-center justify-center font-bold"
                      style={{
                        width: 40, height: 40, borderRadius: 12,
                        background: 'rgba(168,85,247,0.15)',
                        border: '1px solid rgba(168,85,247,0.3)',
                        color: 'var(--brick)', fontSize: 16,
                      }}
                    >
                      {title.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold truncate" style={{ color: 'var(--cream)' }}>{title}</h3>
                      <p className="text-[11px] truncate" style={{ color: 'var(--slate)' }}>
                        {r.leadName ? `${r.leadName} · ` : ''}{r.agentName}
                      </p>
                    </div>
                  </div>
                  <span
                    className="shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}` }}
                  >
                    {statusLabel(r)}
                  </span>
                </div>

                {/* What the demo will contain */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {parts.map(p => (
                    <span
                      key={p.label}
                      className="text-[10px] px-2 py-1 rounded-md"
                      style={{
                        backgroundColor: p.ok ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.04)',
                        color: p.ok ? 'var(--brick)' : 'var(--slate)',
                        border: `1px solid ${p.ok ? 'rgba(168,85,247,0.25)' : 'rgba(255,255,255,0.07)'}`,
                      }}
                    >
                      {p.ok ? '✓' : '○'} {p.label}
                    </span>
                  ))}
                </div>

                <div className="mt-auto">
                  <Link
                    href={`/master-demo/${r.agentId}`}
                    className="block text-center rounded-lg font-semibold transition-all"
                    style={{
                      backgroundColor: 'rgba(168,85,247,0.15)',
                      color: 'var(--brick)',
                      border: '1px solid rgba(168,85,247,0.25)',
                      padding: '10px 0',
                      fontSize: 13,
                      textDecoration: 'none',
                    }}
                  >
                    {r.shareId ? 'Redigera Master Demo →' : 'Bygg Master Demo →'}
                  </Link>
                </div>
              </Panel>
            )
          })}
        </div>
      )}
    </div>
  )
}
