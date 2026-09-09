'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Panel from '@/app/components/Panel'
import { supabase } from '@/lib/supabase'

interface Agent {
  id: string
  name: string
  business_name: string | null
  language: string | null
  intelligence_tier: string | null
  status: string | null
  transfer_number: string | null
  created_at: string
}

interface AgentActivity {
  calls: number
  lastAt: string | null
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft:    { label: 'Utkast',     color: 'var(--slate)' },
  deployed: { label: 'Driftsatt',  color: '#4ade80' },
  paused:   { label: 'Pausad',     color: 'var(--gold)' },
}

function timeAgo(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return 'just nu'
  if (diffMin < 60) return `${diffMin} min sedan`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `${h} tim sedan`
  const d = Math.floor(h / 24)
  return d === 1 ? 'igår' : `${d} dagar sedan`
}

export default function ReceptionistListPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [activity, setActivity] = useState<Record<string, AgentActivity>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: agentRows }, { data: callRows }] = await Promise.all([
        supabase
          .from('agents')
          .select('id,name,business_name,language,intelligence_tier,status,transfer_number,created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('call_logs')
          .select('agent_id, created_at')
          .order('created_at', { ascending: false })
          .limit(500),
      ])

      setAgents((agentRows ?? []) as Agent[])

      // Roll call_logs up per agent — newest row wins for "last activity"
      // since the query is already sorted descending.
      const byAgent: Record<string, AgentActivity> = {}
      for (const row of callRows ?? []) {
        if (!row.agent_id) continue
        if (!byAgent[row.agent_id]) byAgent[row.agent_id] = { calls: 0, lastAt: row.created_at }
        byAgent[row.agent_id].calls += 1
      }
      setActivity(byAgent)
      setLoading(false)
    }
    load()
  }, [])

  async function deleteAgent(id: string, name: string) {
    if (!confirm(`Ta bort agenten "${name}"?`)) return
    await supabase.from('agents').delete().eq('id', id)
    setAgents(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest mb-1" style={{ color: 'var(--brick)' }}>AI & AUTOMATION</p>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
            AI-Receptionister
          </h1>
        </div>
        <Link
          href="/ai-agents/receptionist/ny"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{ backgroundColor: 'rgba(168,85,247,0.2)', color: 'var(--brick)', border: '1px solid rgba(168,85,247,0.3)' }}
        >
          + Ny Agent
        </Link>
      </div>

      {loading ? (
        <Panel padding="p-6" enableTilt={false}>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--slate)' }}>
            <span className="animate-spin">⟳</span> Laddar agenter…
          </div>
        </Panel>
      ) : agents.length === 0 ? (
        <Panel padding="p-10" className="text-center" enableTilt={false}>
          <p className="text-4xl mb-4">📞</p>
          <p className="font-semibold text-lg mb-2" style={{ color: 'var(--cream)' }}>Inga agenter ännu</p>
          <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>
            Skapa din första AI-receptionist på under 3 minuter.
          </p>
          <Link
            href="/ai-agents/receptionist/ny"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold"
            style={{ backgroundColor: 'var(--brick)', color: 'var(--cream)' }}
          >
            + Skapa första agenten
          </Link>
        </Panel>
      ) : (
        <Panel padding="p-0" className="overflow-hidden" enableTilt={false}>
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                {['Agent', 'Status', 'Samtal', 'Senaste aktivitet', 'Telefon', 'Nivå', ''].map(col => (
                  <th key={col} className="px-4 py-3 text-left text-[10px] font-semibold tracking-widest uppercase"
                    style={{ color: 'var(--slate)', whiteSpace: 'nowrap' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map(agent => {
                const st = STATUS_LABEL[agent.status ?? 'draft'] ?? STATUS_LABEL.draft
                const tier = agent.intelligence_tier === 'turbo' ? 'Turbo ⚡' : 'Standard'
                const act = activity[agent.id]
                const isLive = agent.status === 'deployed'
                return (
                  <tr key={agent.id} className="border-b transition-colors hover:bg-white/[0.02]"
                    style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    {/* Agent + business as subtitle — one column instead of two */}
                    <td className="px-4 py-3">
                      <Link href={`/ai-agents/receptionist/${agent.id}`}
                        className="font-semibold hover:underline text-sm"
                        style={{ color: 'var(--cream)' }}>
                        {agent.name}
                      </Link>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--slate)' }}>
                        {agent.business_name ?? '—'} · {agent.language === 'en' ? 'Engelska' : 'Svenska'}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-[10px] font-semibold px-2 py-1 rounded inline-flex items-center gap-1.5"
                        style={{ backgroundColor: `${st.color}15`, color: st.color, border: `1px solid ${st.color}30` }}>
                        {isLive && <span className="animate-pulse">●</span>}
                        {st.label}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-sm font-semibold" style={{ color: act?.calls ? 'var(--cream)' : 'var(--slate)' }}>
                      {act?.calls ?? 0}
                    </td>

                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--slate)' }}>
                      {act?.lastAt ? timeAgo(act.lastAt) : <span className="opacity-40">Inga samtal än</span>}
                    </td>

                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--slate)' }}>
                      {agent.transfer_number
                        ? <a href={`tel:${agent.transfer_number}`} className="hover:underline" style={{ color: 'var(--cream)' }}>{agent.transfer_number}</a>
                        : <span className="opacity-40">Ej satt</span>}
                    </td>

                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--slate)' }}>{tier}</td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        {/* Deep-links straight into the Test tab */}
                        <Link href={`/ai-agents/receptionist/${agent.id}?tab=test`}
                          className="text-xs px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
                          style={{ backgroundColor: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.28)' }}>
                          🎙 Testa
                        </Link>
                        <Link href={`/ai-agents/receptionist/${agent.id}`}
                          className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                          style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: 'var(--brick)', border: '1px solid rgba(168,85,247,0.25)' }}>
                          Öppna
                        </Link>
                        <button onClick={() => deleteAgent(agent.id, agent.name)}
                          className="text-xs px-2 py-1 rounded-lg transition-colors hover:bg-white/10"
                          style={{ color: 'var(--slate)' }}>
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <p className="text-[10px]" style={{ color: 'var(--slate)' }}>{agents.length} agent{agents.length !== 1 ? 'er' : ''} totalt</p>
          </div>
        </Panel>
      )}
    </div>
  )
}
