'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import Panel from '@/app/components/Panel'
import { supabase } from '@/lib/supabase'
import { isMissingColumn } from '@/lib/db-errors'
import { SECTIONS, sectionFlags } from '@/lib/master-sections'
import { CRM_GROUPS, clientStatusOf } from '@/lib/client-status'

// Bygg BOS — one row per client (agent), for building and maintaining the page
// the client works their calls on: /master/[shareId]. It is the same page and
// the same link as Master Demo; Master Demo is the selling view of it, this is
// the running-a-client view.
//
// Everything here is read with the signed-in user's session (RLS
// `authenticated`); nothing on this page is public.

interface Row {
  agentId: string
  title: string
  subtitle: string
  shareId: string | null
  sectionsOn: number
  callsOn: boolean
  hasNumber: boolean
  calls: number
  /** Calls per CRM group key — see CRM_GROUPS. */
  byGroup: Record<string, number>
  /** Contact requests still at "Ny". */
  openRequests: number
  lastCallAt: string | null
}

interface CallAgg {
  agent_id: string
  created_at: string
  contact_request?: string | null
  client_status?: string | null
}

const REQUESTS = ['meeting', 'quote', 'callback']

const WHEN = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
})

/** The client's calls, newest schema first: 028 adds status, 027 the request label. */
async function loadCalls(): Promise<CallAgg[]> {
  for (const cols of [
    'agent_id, created_at, contact_request, client_status',
    'agent_id, created_at, contact_request',
    'agent_id, created_at',
  ]) {
    const { data, error } = await supabase
      .from('call_logs')
      .select(cols)
      .eq('status', 'completed')
      .not('agent_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(2000)
    if (!error) return (data ?? []) as unknown as CallAgg[]
    if (!isMissingColumn(error)) throw new Error(error.message)
  }
  return []
}

export default function BosListPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    async function load() {
      try {
        // master_sections needs migration 017 — without it every section counts as on.
        let agentsRes = await supabase
          .from('agents')
          .select('id, name, business_name, lead_id, public_share_id, master_sections')
          .order('created_at', { ascending: false })
        if (agentsRes.error && isMissingColumn(agentsRes.error)) {
          agentsRes = await supabase
            .from('agents')
            .select('id, name, business_name, lead_id, public_share_id')
            .order('created_at', { ascending: false }) as typeof agentsRes
        }
        if (agentsRes.error) throw new Error(agentsRes.error.message)

        const agents = (agentsRes.data ?? []) as {
          id: string; name: string; business_name: string | null; lead_id: string | null
          public_share_id: string | null; master_sections?: Record<string, boolean> | null
        }[]
        const leadIds = agents.map(a => a.lead_id).filter(Boolean) as string[]

        const [leadsRes, phonesRes, calls] = await Promise.all([
          leadIds.length
            ? supabase.from('leads').select('id, name, business').in('id', leadIds)
            : Promise.resolve({ data: [] as { id: string; name: string | null; business: string | null }[] }),
          supabase.from('phone_numbers').select('agent_id'),
          loadCalls(),
        ])

        const leadById = new Map((leadsRes.data ?? []).map(l => [l.id, l]))
        const withNumber = new Set((phonesRes.data ?? []).map(p => p.agent_id))

        setRows(agents.map(a => {
          const lead = a.lead_id ? leadById.get(a.lead_id) : undefined
          const flags = sectionFlags(a.master_sections)
          const own = calls.filter(c => c.agent_id === a.id)
          const byGroup = Object.fromEntries(CRM_GROUPS.map(g => [
            g.key,
            own.filter(c => g.statuses.includes(clientStatusOf(c.client_status))).length,
          ]))
          return {
            agentId: a.id,
            title: a.business_name || lead?.business || a.name,
            subtitle: [lead?.name, a.name].filter(Boolean).join(' · '),
            shareId: a.public_share_id,
            sectionsOn: SECTIONS.filter(s => flags[s.key]).length,
            callsOn: flags.calls,
            hasNumber: withNumber.has(a.id),
            calls: own.length,
            byGroup,
            openRequests: own.filter(c =>
              REQUESTS.includes(c.contact_request ?? '') && clientStatusOf(c.client_status) === 'ny',
            ).length,
            lastCallAt: own[0]?.created_at ?? null,
          }
        }))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Live clients first: a connected number or real calls is what makes a BOS
  // worth maintaining. Otherwise newest first, as loaded.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const live = (r: Row) => Number(r.hasNumber || r.calls > 0)
    return rows
      .filter(r => !q || [r.title, r.subtitle].some(v => v.toLowerCase().includes(q)))
      .sort((a, b) => live(b) - live(a))
  }, [rows, query])

  const liveCount = rows.filter(r => r.hasNumber || r.calls > 0).length

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <p className="text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--brick)' }}>
          Business Operating System
        </p>
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--cream)', fontFamily: 'Arial, Helvetica, sans-serif' }}>
          🧩 Bygg BOS
        </h1>
        <p className="text-sm max-w-2xl" style={{ color: 'var(--slate)' }}>
          Klientens egen sida: samtalen, uppföljningen och allt annat på en länk — utan inloggning.
          Klienten sätter status och skriver anteckningar själv. Det är samma länk som Master Demo,
          så sektionerna du slår av och på här gäller där också.
        </p>
      </div>

      <Panel padding="p-4" enableTilt={false} className="mb-5">
        <div className="flex gap-3 flex-wrap items-center">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Sök på klient eller agent…"
            className="flex-1 min-w-[220px]"
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--cream)', borderRadius: 8, padding: '9px 13px', fontSize: 14, outline: 'none',
            }}
          />
          <span className="text-xs shrink-0" style={{ color: 'var(--slate)' }}>
            {liveCount} av {rows.length} har nummer eller samtal
          </span>
        </div>
      </Panel>

      {error && (
        <Panel padding="p-4" enableTilt={false} className="mb-5">
          <p className="text-xs" style={{ color: '#ef4444' }}>⚠️ {error}</p>
        </Panel>
      )}

      {loading ? (
        <Panel padding="p-10" enableTilt={false}>
          <p className="text-sm text-center" style={{ color: 'var(--slate)' }}>Laddar klienter…</p>
        </Panel>
      ) : visible.length === 0 ? (
        <Panel padding="p-10" enableTilt={false}>
          <p className="text-sm text-center" style={{ color: 'var(--slate)' }}>
            {rows.length === 0
              ? 'Inga AI-agenter än — skapa en receptionist först, så kan du bygga en BOS för den.'
              : 'Ingen klient matchar din sökning.'}
          </p>
        </Panel>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {visible.map(r => (
            <Panel key={r.agentId} padding="p-5" enableTilt={false} className="flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="shrink-0 flex items-center justify-center font-bold"
                    style={{
                      width: 40, height: 40, borderRadius: 12, fontSize: 16, color: 'var(--brick)',
                      background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)',
                    }}
                  >
                    {r.title.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold truncate" style={{ color: 'var(--cream)' }}>{r.title}</h3>
                    <p className="text-[11px] truncate" style={{ color: 'var(--slate)' }}>{r.subtitle}</p>
                  </div>
                </div>
                {r.openRequests > 0 && (
                  <span
                    className="shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: 'var(--brick)', color: 'white' }}
                    title="Förfrågningar som klienten inte har följt upp än"
                  >
                    {r.openRequests} vill bli kontaktad{r.openRequests === 1 ? '' : 'e'}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 mb-3">
                <Chip ok={Boolean(r.shareId)} label={r.shareId ? 'Länk aktiv' : 'Ingen länk'} />
                <Chip ok={r.hasNumber} label={r.hasNumber ? 'Nummer kopplat' : 'Inget nummer'} />
                <Chip ok={r.callsOn} label={r.callsOn ? 'Samtal visas' : 'Samtal avstängt'} />
                <Chip ok label={`${r.sectionsOn} av ${SECTIONS.length} sektioner`} />
              </div>

              {r.calls > 0 ? (
                <div
                  className="grid grid-cols-4 gap-1.5 mb-4 text-center"
                  aria-label="Klientens samtal per status"
                >
                  {CRM_GROUPS.map(g => (
                    <div key={g.key} className="rounded-lg py-2" style={{
                      backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                    }}>
                      <p className="text-base font-bold" style={{ color: g.key === 'nya' && r.byGroup[g.key] ? 'var(--brick)' : 'var(--cream)' }}>
                        {r.byGroup[g.key]}
                      </p>
                      <p className="text-[9.5px] leading-tight px-1" style={{ color: 'var(--slate)' }}>{g.label}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] mb-4" style={{ color: 'var(--slate)' }}>
                  {r.hasNumber ? 'Inga samtal än.' : 'Inga samtal — koppla ett nummer till receptionisten för att ta emot samtal.'}
                </p>
              )}

              {r.lastCallAt && (
                <p className="text-[11px] mb-3 -mt-2" style={{ color: 'var(--slate)' }}>
                  Senaste samtal {WHEN.format(new Date(r.lastCallAt))} · {r.calls} totalt
                </p>
              )}

              <div className="mt-auto flex gap-2">
                <Link
                  href={`/bos/${r.agentId}`}
                  className="flex-1 block text-center rounded-lg font-semibold transition-all"
                  style={{
                    backgroundColor: 'rgba(168,85,247,0.15)', color: 'var(--brick)',
                    border: '1px solid rgba(168,85,247,0.25)', padding: '10px 0', fontSize: 13, textDecoration: 'none',
                  }}
                >
                  {r.shareId ? 'Redigera BOS →' : 'Bygg BOS →'}
                </Link>
                {r.shareId && (
                  <a
                    href={`/master/${r.shareId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg transition-colors"
                    style={{
                      color: 'var(--slate)', border: '1px solid rgba(255,255,255,0.1)',
                      padding: '10px 12px', fontSize: 12, textDecoration: 'none',
                    }}
                    title="Öppna klientens sida i en ny flik"
                  >
                    Öppna ↗
                  </a>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className="text-[10px] px-2 py-1 rounded-md"
      style={{
        backgroundColor: ok ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.04)',
        color: ok ? 'var(--brick)' : 'var(--slate)',
        border: `1px solid ${ok ? 'rgba(168,85,247,0.25)' : 'rgba(255,255,255,0.07)'}`,
      }}
    >
      {ok ? '✓' : '○'} {label}
    </span>
  )
}
