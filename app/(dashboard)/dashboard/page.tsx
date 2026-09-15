'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { LEAD_STATUS, LEAD_STATUSES } from '@/lib/lead-status'
import Panel from '../../components/Panel'
import Particles from '../../components/Particles'

// ─── Constants ───────────────────────────────────────────────────────────────
const TODAY = new Date().toISOString().split('T')[0]
const DEFAULT_CALL_GOAL = 20
const DEFAULT_PROPOSAL_GOAL = 5

/** sv-SE currency, no decimals — amounts here are whole kronor. */
function kr(n: number): string {
  return `${n.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr`
}

const CHECKLIST_ITEMS = [
  { key: 'cold_calls', label: 'Gör dina dagliga cold calls' },
  { key: 'update_crm', label: 'Uppdatera CRM med nya leads' },
  { key: 'follow_up', label: 'Följ upp kontaktade leads' },
  { key: 'send_proposals', label: 'Skicka förslag till varma leads' },
]

// Was a private list of English keys (contacted/meeting/proposal/won/lost) that
// matched none of the slugs the CRM writes, so every step but "Ny" rendered 0.
const PIPELINE_STATUSES = LEAD_STATUSES.map(({ value, label }) => ({ key: value, label }))

// ─── Types ────────────────────────────────────────────────────────────────────
interface Stats {
  todayCalls: number
  meetingLeads: number
  activeClients: number
  todayProposals: number
  /** Sum of paid invoices, all time. */
  grossRevenue: number
  /** Sum of paid invoices flagged is_recurring — the only honest basis for MRR. */
  mrr: number
  pipeline: Record<string, number>
}

interface Agent { id: string; name: string; status: string }
interface Meeting { id: string; title: string; scheduled_at: string; status: string }
interface Activity { id: string; description: string; created_at: string }

// ─── Small reusable pieces ────────────────────────────────────────────────────
function StatCard({
  label, value, goal, sub,
}: { label: string; value: number | string; goal?: number; sub?: string }) {
  return (
    <Panel padding="p-4" className="flex-1 min-w-[130px]" tiltMaxAngle={6}>
      <p className="text-[10px] tracking-widest uppercase mb-2" style={{ color: 'var(--slate)' }}>
        {label}
      </p>
      <p className="text-3xl font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
        {value}
      </p>
      {goal != null && (
        <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>mål {goal}</p>
      )}
      {sub && (
        <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{sub}</p>
      )}
    </Panel>
  )
}

function ProgressBar({ value, max, color = 'var(--brick)' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="w-full rounded-full h-2" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
      <div
        className="h-2 rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {label}
    </span>
  )
}

function statusColor(s: string) {
  const m: Record<string, string> = {
    active: 'var(--gold)',
    draft: 'var(--slate)',
    inactive: '#666',
    scheduled: 'var(--gold)',
    completed: '#4ade80',
    cancelled: '#ef4444',
  }
  return m[s] ?? 'var(--slate)'
}

function statusLabel(s: string) {
  const m: Record<string, string> = {
    active: 'Aktiv', draft: 'Utkast', inactive: 'Inaktiv',
    scheduled: 'Planerat', completed: 'Klar', cancelled: 'Avbokad',
  }
  return m[s] ?? s
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just nu'
  if (m < 60) return `${m}m sedan`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h sedan`
  return `${Math.floor(h / 24)}d sedan`
}

function formatMeetingTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('sv-SE', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  // ─ Data state
  const [displayName, setDisplayName] = useState<string>('')
  const [stats, setStats] = useState<Stats>({ todayCalls: 0, meetingLeads: 0, activeClients: 0, todayProposals: 0, grossRevenue: 0, mrr: 0, pipeline: {} })
  const [agents, setAgents] = useState<Agent[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [proposalGoal, setProposalGoal] = useState<number>(DEFAULT_PROPOSAL_GOAL)
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput] = useState('')
  const goalInputRef = useRef<HTMLInputElement>(null)

  const [callGoal, setCallGoal] = useState<number>(DEFAULT_CALL_GOAL)
  const [editingCallGoal, setEditingCallGoal] = useState(false)
  const [callGoalInput, setCallGoalInput] = useState('')
  const callGoalInputRef = useRef<HTMLInputElement>(null)

  const [goalError, setGoalError] = useState('')
  const [loadError, setLoadError] = useState('')

  // ─ Checklist state (stored in localStorage per date, synced to Supabase)
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const deviceId = useRef<string>('')

  // ─ UI state
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [loading, setLoading] = useState(true)

  // ─── Fetch all dashboard data ────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const todayStart = `${TODAY}T00:00:00.000Z`
      const todayEnd = `${TODAY}T23:59:59.999Z`

      const [
        profileRes,
        callsRes,
        meetingLeadsRes,
        activeClientsRes,
        proposalsRes,
        pipelineRes,
        agentsRes,
        meetingsRes,
        activityRes,
        checklistRes,
        invoicesRes,
      ] = await Promise.all([
        supabase.from('profile').select('*').maybeSingle(),
        supabase.from('call_logs').select('id', { count: 'exact', head: true })
          .gte('created_at', todayStart).lte('created_at', todayEnd),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', LEAD_STATUS.MOTE),
        // active = review_clients + agents with status active
        supabase.from('review_clients').select('id', { count: 'exact', head: true }),
        supabase.from('proposals').select('id', { count: 'exact', head: true })
          .gte('created_at', todayStart).lte('created_at', todayEnd),
        supabase.from('leads').select('status'),
        supabase.from('agents').select('id, name, status').limit(10),
        supabase.from('meetings').select('id, title, scheduled_at, status')
          .gte('scheduled_at', new Date().toISOString())
          .order('scheduled_at', { ascending: true }).limit(5),
        supabase.from('activity_log').select('id, description, created_at')
          .order('created_at', { ascending: false }).limit(5),
        supabase.from('daily_checklist').select('item_key, completed')
          .eq('user_id', deviceId.current).eq('date', TODAY),
        // select('*') rather than naming is_recurring: the column arrives with
        // migration 022, and naming a column that does not exist yet would make
        // PostgREST reject the whole request and blank the dashboard.
        supabase.from('invoices').select('*'),
      ])

      // Profile — both goals live here, not in localStorage.
      if (profileRes.data) {
        const p = profileRes.data as Record<string, unknown>
        setDisplayName((p.display_name as string) ?? '')
        const pg = p.daily_proposal_goal as number | null
        if (pg) { setProposalGoal(pg); setGoalInput(String(pg)) }
        const cg = p.daily_call_goal as number | null
        if (cg) { setCallGoal(cg); setCallGoalInput(String(cg)) }
      }

      // Revenue. Bruttointäkt is every paid invoice; MRR is the paid ones that
      // repeat. Both are 0 until invoices are actually marked paid — that is a
      // real figure, not a placeholder.
      let grossRevenue = 0
      let mrr = 0
      for (const inv of (invoicesRes.data ?? []) as Record<string, unknown>[]) {
        if (inv.status !== 'paid') continue
        const amount = Number(inv.amount) || 0
        grossRevenue += amount
        if (inv.is_recurring === true) mrr += amount
      }

      // Pipeline counts
      const pipeline: Record<string, number> = {}
      for (const row of pipelineRes.data ?? []) {
        pipeline[row.status] = (pipeline[row.status] ?? 0) + 1
      }

      setStats({
        todayCalls: callsRes.count ?? 0,
        meetingLeads: meetingLeadsRes.count ?? 0,
        activeClients: activeClientsRes.count ?? 0,
        todayProposals: proposalsRes.count ?? 0,
        grossRevenue,
        mrr,
        pipeline,
      })

      setAgents(agentsRes.data ?? [])
      setMeetings(meetingsRes.data ?? [])
      setActivity(activityRes.data ?? [])

      // Checklist from Supabase (merge with localStorage)
      const dbChecked: Record<string, boolean> = {}
      for (const row of checklistRes.data ?? []) dbChecked[row.item_key] = row.completed
      setChecklist(prev => ({ ...prev, ...dbChecked }))
    } catch (err) {
      // Was silent, which made a failed load look like an empty account.
      setLoadError(err instanceof Error ? err.message : 'Kunde inte hämta dashboard-data.')
    } finally {
      setLoading(false)
    }
  }, [])

  // ─── Init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Device ID (stable per browser, substitute for real user_id pre-auth)
    let id = localStorage.getItem('loopr_device_id')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('loopr_device_id', id)
    }
    deviceId.current = id

    // Banner dismissed?
    setBannerDismissed(localStorage.getItem('loopr_banner_dismissed') === '1')

    // Checklist from localStorage (fast render before Supabase)
    const lsKey = `loopr_checklist_${TODAY}`
    const lsData = localStorage.getItem(lsKey)
    if (lsData) setChecklist(JSON.parse(lsData))

    fetchData()
  }, [fetchData])

  // ─── Checklist toggle ────────────────────────────────────────────────────
  const toggleChecklist = useCallback(async (key: string) => {
    const next = !checklist[key]
    const updated = { ...checklist, [key]: next }
    setChecklist(updated)
    localStorage.setItem(`loopr_checklist_${TODAY}`, JSON.stringify(updated))
    // Persist to Supabase (upsert)
    await supabase.from('daily_checklist').upsert(
      { user_id: deviceId.current, date: TODAY, item_key: key, completed: next },
      { onConflict: 'user_id,date,item_key' }
    )
  }, [checklist])

  // ─── Proposal goal save ──────────────────────────────────────────────────
  /**
   * Both goals persist on the signed-in user's profile row.
   * user_id is always sent: the owner policies in 021_profile_fields.sql check
   * it on insert, and it is harmless under the older blanket policy.
   */
  const saveGoals = useCallback(async (patch: { daily_proposal_goal?: number; daily_call_goal?: number }) => {
    setGoalError('')
    const { data: userData } = await supabase.auth.getUser()
    const uid = userData.user?.id
    if (!uid) { setGoalError('Ingen session — logga in igen.'); return }

    const { error } = await supabase
      .from('profile')
      .upsert({ user_id: uid, ...patch }, { onConflict: 'user_id' })
    if (error) setGoalError(`Målet kunde inte sparas: ${error.message}`)
  }, [])

  const saveGoal = useCallback(async () => {
    const n = Math.max(1, parseInt(goalInput) || DEFAULT_PROPOSAL_GOAL)
    setProposalGoal(n)
    setGoalInput(String(n))
    setEditingGoal(false)
    await saveGoals({ daily_proposal_goal: n })
  }, [goalInput, saveGoals])

  const saveCallGoal = useCallback(async () => {
    const n = Math.max(1, parseInt(callGoalInput) || DEFAULT_CALL_GOAL)
    setCallGoal(n)
    setCallGoalInput(String(n))
    setEditingCallGoal(false)
    await saveGoals({ daily_call_goal: n })
  }, [callGoalInput, saveGoals])

  // Focus goal input when editing starts
  useEffect(() => {
    if (editingGoal) goalInputRef.current?.focus()
  }, [editingGoal])

  useEffect(() => {
    if (editingCallGoal) callGoalInputRef.current?.focus()
  }, [editingCallGoal])

  // ─── Dismiss banner ──────────────────────────────────────────────────────
  const dismissBanner = () => {
    setBannerDismissed(true)
    localStorage.setItem('loopr_banner_dismissed', '1')
  }

  // ─── Loading skeleton ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <Panel padding="px-5 py-4" magic={false}>
          <div className="h-4 w-48 rounded animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
          <div className="h-8 w-80 rounded mt-2 animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
        </Panel>
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Panel key={i} padding="p-4" className="flex-1 min-w-[130px] h-24 animate-pulse" magic={false} />
          ))}
        </div>
      </div>
    )
  }

  // ─── Derived values ───────────────────────────────────────────────────────
  const pipelineMax = Math.max(...Object.values(stats.pipeline), 1)
  const checklistDone = CHECKLIST_ITEMS.filter(i => checklist[i.key]).length
  const callsLeft = Math.max(0, callGoal - stats.todayCalls)
  const proposalsLeft = Math.max(0, proposalGoal - stats.todayProposals)

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-8">

      {/* Particles test layer — sits between ColorBends (z:0) and content (z:10) */}
      <Particles
        particleColors={['#A855F7', '#3B82F6', '#2DD4BF']}
        particleCount={200}
        particleSpread={10}
        speed={0.1}
        particleBaseSize={100}
        moveParticlesOnHover={true}
        alphaParticles={false}
        disableRotation={false}
      />

      {/* ── 1. HERO ─────────────────────────────────────────────────────── */}
      <div>
        <h1
          className="text-3xl font-bold"
          style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}
        >
          Välkommen{displayName ? `, ${displayName}` : ''} — dags att lägga i växeln.
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--slate)' }}>
          Ditt team jobbar. Här är vad som hänt idag.
        </p>
      </div>

      {/* ── 2. ONBOARDING BANNER ─────────────────────────────────────────── */}
      {!bannerDismissed && (
        <Panel padding="px-5 py-4" className="flex items-center justify-between gap-4" enableTilt={false}>
          <div className="flex items-center gap-4">
            <span className="text-2xl">🎓</span>
            <div>
              <p className="font-semibold" style={{ color: 'var(--cream)' }}>
                Titta på din kostnadsfria Loopr-utbildning
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>
                Lär dig plattformen på under 30 minuter.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/utbildning"
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ backgroundColor: 'var(--brick)', color: 'var(--cream)' }}
            >
              Watch Now
            </Link>
            <button
              onClick={dismissBanner}
              className="text-lg leading-none transition-opacity hover:opacity-60"
              style={{ color: 'var(--slate)' }}
              aria-label="Stäng"
            >
              ✕
            </button>
          </div>
        </Panel>
      )}

      {(loadError || goalError) && (
        <Panel padding="px-5 py-3" magic={false}>
          {loadError && <p className="text-sm" style={{ color: '#ef4444' }}>⚠️ {loadError}</p>}
          {goalError && <p className="text-sm" style={{ color: '#fbbf24' }}>⚠️ {goalError}</p>}
        </Panel>
      )}

      {/* ── 3. SEX STATISTIKKORT ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <StatCard label="Dagens Samtal" value={stats.todayCalls} goal={callGoal} />
        <StatCard label="Möten" value={stats.meetingLeads} />
        <StatCard label="Aktiva Kunder" value={stats.activeClients} />
        <StatCard
          label="MRR"
          value={kr(stats.mrr)}
          sub={stats.mrr === 0 ? 'Inga återkommande fakturor betalda' : 'Betalda återkommande fakturor'}
        />
        <StatCard
          label="Bruttointäkt"
          value={kr(stats.grossRevenue)}
          sub={stats.grossRevenue === 0 ? 'Ingen faktura markerad betald än' : 'Alla betalda fakturor'}
        />
        <StatCard label="Skickade Förslag" value={stats.todayProposals} goal={proposalGoal} />
      </div>

      {/* ── 4. MÅL-WIDGETS ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Dagligt Samtalsmål */}
        <Panel padding="p-5" className="space-y-3" tiltMaxAngle={4}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] tracking-widest uppercase mb-1" style={{ color: 'var(--slate)' }}>
                Dagligt Samtalsmål
              </p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
                  {stats.todayCalls} /
                </p>
                {editingCallGoal ? (
                  <input
                    ref={callGoalInputRef}
                    type="number"
                    min={1}
                    value={callGoalInput}
                    onChange={e => setCallGoalInput(e.target.value)}
                    onBlur={saveCallGoal}
                    onKeyDown={e => e.key === 'Enter' && saveCallGoal()}
                    className="w-12 text-xl font-bold bg-transparent border-b outline-none text-center"
                    style={{ color: 'var(--brick)', borderColor: 'var(--brick)' }}
                    aria-label="Dagligt samtalsmål"
                  />
                ) : (
                  <button
                    onClick={() => { setEditingCallGoal(true); setCallGoalInput(String(callGoal)) }}
                    className="text-2xl font-bold hover:opacity-70 transition-opacity underline decoration-dotted"
                    style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)', textDecorationColor: 'var(--slate)' }}
                    title="Klicka för att redigera mål"
                  >
                    {callGoal}
                  </button>
                )}
              </div>
            </div>
            <span className="text-2xl">📞</span>
          </div>
          <ProgressBar value={stats.todayCalls} max={callGoal} />
          <p className="text-xs" style={{ color: 'var(--slate)' }}>
            {callsLeft === 0
              ? '🎉 Mål uppnått idag!'
              : `${callsLeft} fler samtal — klicka på siffran för att ändra mål`}
          </p>
        </Panel>

        {/* Dagligt Förslagsmål */}
        <Panel padding="p-5" className="space-y-3" tiltMaxAngle={4}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] tracking-widest uppercase mb-1" style={{ color: 'var(--slate)' }}>
                Dagligt Förslagsmål
              </p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
                  {stats.todayProposals} /
                </p>
                {editingGoal ? (
                  <input
                    ref={goalInputRef}
                    type="number"
                    min={1}
                    value={goalInput}
                    onChange={e => setGoalInput(e.target.value)}
                    onBlur={saveGoal}
                    onKeyDown={e => e.key === 'Enter' && saveGoal()}
                    className="w-12 text-xl font-bold bg-transparent border-b outline-none text-center"
                    style={{ color: 'var(--brick)', borderColor: 'var(--brick)' }}
                  />
                ) : (
                  <button
                    onClick={() => { setEditingGoal(true); setGoalInput(String(proposalGoal)) }}
                    className="text-2xl font-bold hover:opacity-70 transition-opacity underline decoration-dotted"
                    style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)', textDecorationColor: 'var(--slate)' }}
                    title="Klicka för att redigera mål"
                  >
                    {proposalGoal}
                  </button>
                )}
              </div>
            </div>
            <span className="text-2xl">📄</span>
          </div>
          <ProgressBar value={stats.todayProposals} max={proposalGoal} />
          <p className="text-xs" style={{ color: 'var(--slate)' }}>
            {proposalsLeft === 0
              ? '🎉 Mål uppnått idag!'
              : `${proposalsLeft} förslag kvar — klicka på siffran för att ändra mål`}
          </p>
        </Panel>
      </div>

      {/* ── 5. PROMO-BANNERS ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Panel padding="p-5" className="flex items-center justify-between gap-4" enableTilt={false}>
          <div>
            <p className="text-xs tracking-widest mb-1" style={{ color: 'var(--gold)' }}>KOM IGÅNG</p>
            <p className="font-semibold" style={{ color: 'var(--cream)' }}>
              Samla in din första betalning
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>
              Skicka en betallänk till en klient idag.
            </p>
          </div>
          <Link
            href="/skicka-betalningar"
            className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ backgroundColor: 'rgba(201,162,75,0.15)', color: 'var(--gold)', border: '1px solid rgba(201,162,75,0.3)' }}
          >
            Go →
          </Link>
        </Panel>

        <Panel padding="p-5" className="flex items-center justify-between gap-4" enableTilt={false}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs tracking-widest" style={{ color: 'var(--brick)' }}>SPEED-TO-LEAD</p>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'var(--brick)', color: 'var(--cream)' }}
              >
                NY
              </span>
            </div>
            <p className="font-semibold" style={{ color: 'var(--cream)' }}>
              Bygg din Speed-to-Lead-agent
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>
              Sälj för 10 000+ kr/mån med automatisk leadkvalificering.
            </p>
          </div>
          <Link
            href="/speed-to-lead"
            className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
            style={{ backgroundColor: 'rgba(168,85,247,0.2)', color: 'var(--brick)', border: '1px solid rgba(168,85,247,0.3)' }}
          >
            Build it →
          </Link>
        </Panel>
      </div>

      {/* ── 6. DAGENS CHECKLISTA ─────────────────────────────────────────── */}
      <Panel padding="p-5" enableTilt={false}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold" style={{ color: 'var(--cream)' }}>
            Dagens checklista
          </p>
          <p className="text-xs" style={{ color: 'var(--slate)' }}>
            {checklistDone}/{CHECKLIST_ITEMS.length} klara
          </p>
        </div>
        <div className="space-y-3">
          {CHECKLIST_ITEMS.map(item => (
            <button
              key={item.key}
              onClick={() => toggleChecklist(item.key)}
              className="w-full flex items-center gap-3 text-left transition-opacity hover:opacity-80"
            >
              <div
                className="w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all"
                style={{
                  backgroundColor: checklist[item.key] ? 'var(--brick)' : 'transparent',
                  border: `2px solid ${checklist[item.key] ? 'var(--brick)' : 'rgba(255,255,255,0.2)'}`,
                }}
              >
                {checklist[item.key] && (
                  <span className="text-xs text-white font-bold">✓</span>
                )}
              </div>
              <span
                className="text-sm"
                style={{
                  color: checklist[item.key] ? 'var(--slate)' : 'var(--cream)',
                  textDecoration: checklist[item.key] ? 'line-through' : 'none',
                }}
              >
                {item.label}
              </span>
            </button>
          ))}
        </div>
        {checklistDone === CHECKLIST_ITEMS.length && (
          <p className="mt-4 text-sm text-center" style={{ color: 'var(--gold)' }}>
            🌟 Alla uppgifter klara för idag!
          </p>
        )}
      </Panel>

      {/* ── 7. PIPELINE OVERVIEW ─────────────────────────────────────────── */}
      <Panel padding="p-5" enableTilt={false}>
        <p className="font-semibold mb-4" style={{ color: 'var(--cream)' }}>
          Pipeline Overview
        </p>
        {Object.values(stats.pipeline).every(v => v === 0) || Object.keys(stats.pipeline).length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--slate)' }}>Inga leads i pipeline än.</p>
        ) : (
          <div className="space-y-3">
            {PIPELINE_STATUSES.map(({ key, label }) => {
              const count = stats.pipeline[key] ?? 0
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="text-xs w-20 shrink-0" style={{ color: 'var(--slate)' }}>{label}</span>
                  <div className="flex-1">
                    <ProgressBar value={count} max={pipelineMax} color="var(--brick)" />
                  </div>
                  <span className="text-xs w-6 text-right shrink-0" style={{ color: 'var(--cream)' }}>
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      {/* ── 8. TRE KOLUMNER ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Dagens Aktivitet */}
        <Panel padding="p-5" tiltMaxAngle={6}>
          <p className="font-semibold mb-4" style={{ color: 'var(--cream)' }}>Dagens Aktivitet</p>
          {activity.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--slate)' }}>Inga aktiviteter än.</p>
          ) : (
            <ul className="space-y-3">
              {activity.map(a => (
                <li key={a.id} className="flex items-start gap-2">
                  <span
                    className="mt-0.5 w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: 'var(--brick)', marginTop: '6px' }}
                  />
                  <div>
                    <p className="text-sm" style={{ color: 'var(--cream)' }}>{a.description}</p>
                    <p className="text-xs" style={{ color: 'var(--slate)' }}>{timeAgo(a.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Kommande Möten */}
        <Panel padding="p-5" tiltMaxAngle={6}>
          <p className="font-semibold mb-4" style={{ color: 'var(--cream)' }}>Kommande Möten</p>
          {meetings.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--slate)' }}>Inga planerade möten.</p>
          ) : (
            <ul className="space-y-3">
              {meetings.map(m => (
                <li key={m.id}>
                  <p className="text-sm font-medium" style={{ color: 'var(--cream)' }}>{m.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs" style={{ color: 'var(--slate)' }}>{formatMeetingTime(m.scheduled_at)}</p>
                    <Badge label={statusLabel(m.status)} color={statusColor(m.status)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Mina Agenter */}
        <Panel padding="p-5" tiltMaxAngle={6}>
          <div className="flex items-center justify-between mb-4">
            <p className="font-semibold" style={{ color: 'var(--cream)' }}>Mina Agenter</p>
            <Link
              href="/ai-agents"
              className="text-xs hover:opacity-70 transition-opacity"
              style={{ color: 'var(--brick)' }}
            >
              Visa alla →
            </Link>
          </div>
          {agents.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm mb-2" style={{ color: 'var(--slate)' }}>Inga agenter skapade än.</p>
              <Link
                href="/ai-agents"
                className="text-xs font-semibold hover:opacity-80 transition-opacity"
                style={{ color: 'var(--brick)' }}
              >
                + Skapa din första agent
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {agents.map(a => (
                <li key={a.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🤖</span>
                    <p className="text-sm" style={{ color: 'var(--cream)' }}>{a.name}</p>
                  </div>
                  <Badge label={statusLabel(a.status)} color={statusColor(a.status)} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

    </div>
  )
}
