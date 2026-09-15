'use client'

import { useState, useEffect } from 'react'
import Panel from '@/app/components/Panel'
import Dropdown from '@/app/components/Dropdown'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Proposal {
  id: string
  lead_id: string | null
  title: string
  tagline: string | null
  avg_job_value: number | null
  is_public: boolean
  status: string
  share_id: string
  view_count: number | null
  sent_at: string | null
  created_at: string
}

interface Lead {
  id: string
  name: string | null
  business: string | null
}

interface Profile {
  id: string
  display_name: string | null
  bio: string | null
  phone: string | null
  avatar_url: string | null
  business_name: string | null
  tagline: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  draft:    { label: 'Utkast',     color: 'rgba(255,255,255,0.45)', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.1)' },
  sent:     { label: 'Skickat',    color: 'var(--gold)',            bg: 'rgba(201,162,75,0.12)',  border: 'rgba(201,162,75,0.3)' },
  viewed:   { label: 'Sett',       color: '#60a5fa',               bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)' },
  accepted: { label: 'Accepterat', color: '#4ade80',               bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.3)' },
  rejected: { label: 'Nekat',      color: 'var(--brick)',          bg: 'rgba(168,85,247,0.12)',   border: 'rgba(168,85,247,0.3)' },
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

// ─── Daily Goal ────────────────────────────────────────────────────────────────
function DailyGoal({ todayCount }: { todayCount: number }) {
  const [goal, setGoal] = useState(5)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(5)

  useEffect(() => {
    const saved = Number(localStorage.getItem('proposal_daily_goal') || 5)
    setGoal(saved)
    setDraft(saved)
  }, [])

  function saveGoal() {
    const val = Math.max(1, draft)
    setGoal(val)
    localStorage.setItem('proposal_daily_goal', String(val))
    setEditing(false)
  }

  const pct = Math.min(100, Math.round((todayCount / goal) * 100))

  return (
    <Panel padding="p-5" tiltMaxAngle={6}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs" style={{ color: 'var(--slate)' }}>Dagligt mål</p>
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="number" min={1} max={99}
              value={draft}
              onChange={e => setDraft(Number(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && saveGoal()}
              className="w-14 text-sm text-center rounded-lg"
              style={{ ...inputStyle, padding: '4px 8px', width: 56 }}
              autoFocus
            />
            <button onClick={saveGoal} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--brick)', color: 'white' }}>✓</button>
          </div>
        ) : (
          <button onClick={() => { setDraft(goal); setEditing(true) }} className="text-xs" style={{ color: 'var(--slate)' }}>
            Mål: {goal} ✎
          </button>
        )}
      </div>
      <div className="flex items-end gap-2 mb-2">
        <span className="text-2xl font-bold" style={{ color: 'var(--cream)' }}>{todayCount}</span>
        <span className="text-sm pb-0.5" style={{ color: 'var(--slate)' }}>/ {goal} förslag</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? '#4ade80' : 'var(--brick)' }} />
      </div>
      <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{pct}% av dagens mål</p>
    </Panel>
  )
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Panel padding="p-5" tiltMaxAngle={6}>
      <p className="text-xs mb-2" style={{ color: 'var(--slate)' }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color: 'var(--cream)' }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</p>}
    </Panel>
  )
}

// ─── Edit About Me Modal ───────────────────────────────────────────────────────
function EditAboutMeModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile | null
  onClose: () => void
  onSaved: (p: Profile) => void
}) {
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [businessName, setBusinessName] = useState(profile?.business_name ?? '')
  const [tagline, setTagline] = useState(profile?.tagline ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    const payload = { display_name: displayName || null, bio: bio || null, phone: phone || null, business_name: businessName || null, tagline: tagline || null, avatar_url: avatarUrl || null }

    // One row per user, upserted on user_id — the same write the Profil page
    // makes. user_id is required: the insert policy in 021_profile_fields.sql
    // checks it, so the old payload without it would now be rejected outright.
    const { data: userData } = await supabase.auth.getUser()
    const uid = userData.user?.id
    if (!uid) { setSaving(false); setError('Ingen session — logga in igen.'); return }

    const { data, error: e } = await supabase
      .from('profile')
      .upsert({ user_id: uid, ...payload }, { onConflict: 'user_id' })
      .select()
      .single()
    setSaving(false)
    if (e || !data) { setError(e?.message ?? 'Fel'); return }
    localStorage.setItem('profile_id', data.id)
    onSaved(data)
  }

  const fields = [
    { label: 'Namn', value: displayName, set: setDisplayName, placeholder: 'Ex. Erik Lindqvist' },
    { label: 'Företagsnamn', value: businessName, set: setBusinessName, placeholder: 'Ex. Loopr AB' },
    { label: 'Tagline', value: tagline, set: setTagline, placeholder: 'Vi hjälper lokala företag att växa' },
    { label: 'Telefon', value: phone, set: setPhone, placeholder: '070-000 00 00' },
    { label: 'Profilbild URL', value: avatarUrl, set: setAvatarUrl, placeholder: 'https://...' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-md mx-4 max-h-screen overflow-y-auto py-8">
        <Panel enableTilt={false}>
          <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--cream)' }}>Redigera profil</h2>
          <div className="space-y-4">
            {fields.map(({ label, value, set, placeholder }) => (
              <div key={label}>
                <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>{label}</label>
                <input style={inputStyle} value={value} onChange={e => set(e.target.value)} placeholder={placeholder} />
              </div>
            ))}
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Bio</label>
              <textarea
                style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="Kort beskrivning om dig och ditt företag..."
              />
            </div>
          </div>
          {error && <p className="text-sm mt-3" style={{ color: 'var(--brick)' }}>{error}</p>}
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={onClose} style={{ color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>Avbryt</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'var(--brick)', color: 'white', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Sparar...' : 'Spara profil'}
            </button>
          </div>
        </Panel>
      </div>
    </div>
  )
}

// ─── Create Proposal Modal ─────────────────────────────────────────────────────
function CreateProposalModal({
  leads,
  onClose,
  onCreated,
}: {
  leads: Lead[]
  onClose: () => void
  onCreated: (p: Proposal) => void
}) {
  const [leadId, setLeadId] = useState('')
  const [title, setTitle] = useState('')
  const [tagline, setTagline] = useState('')
  const [avgValue, setAvgValue] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!title.trim()) { setError('Rubrik krävs'); return }
    setSaving(true)
    setError('')
    const { data, error: e } = await supabase
      .from('proposals')
      .insert({
        lead_id: leadId || null,
        title: title.trim(),
        tagline: tagline.trim() || null,
        avg_job_value: avgValue ? Number(avgValue) : null,
        is_public: isPublic,
        status: isPublic ? 'sent' : 'draft',
      })
      .select()
      .single()
    setSaving(false)
    if (e || !data) { setError(e?.message ?? 'Fel'); return }
    onCreated(data)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-md mx-4 max-h-screen overflow-y-auto py-8">
        <Panel enableTilt={false}>
          <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--cream)' }}>Skapa förslag</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Lead (valfritt)</label>
              <Dropdown
                value={leadId}
                onChange={setLeadId}
                placeholder="— Välj lead —"
                style={inputStyle}
                options={leads.map(l => ({ value: l.id, label: l.business || l.name || l.id.slice(0, 8) }))}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Rubrik *</label>
              <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex. Digital marknadsföringslösning" />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Tagline</label>
              <input style={inputStyle} value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Kort säljande beskrivning" />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Genomsnittligt jobbvärde (kr)</label>
              <input type="number" min={0} style={inputStyle} value={avgValue} onChange={e => setAvgValue(e.target.value)} placeholder="Ex. 15000" />
            </div>
            {/* Public toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--cream)' }}>Publik</p>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>Genererar delbar länk direkt</p>
              </div>
              <button
                onClick={() => setIsPublic(v => !v)}
                className="w-11 h-6 rounded-full relative transition-all"
                style={{ background: isPublic ? 'var(--brick)' : 'rgba(255,255,255,0.1)', flexShrink: 0 }}
                type="button"
              >
                <span
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                  style={{ left: isPublic ? '22px' : '2px' }}
                />
              </button>
            </div>
          </div>
          {error && <p className="text-sm mt-3" style={{ color: 'var(--brick)' }}>{error}</p>}
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={onClose} style={{ color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>Avbryt</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'var(--brick)', color: 'white', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Sparar...' : 'Skapa förslag'}
            </button>
          </div>
        </Panel>
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [{ data: propsData }, { data: leadsData }] = await Promise.all([
      supabase.from('proposals').select('*').order('created_at', { ascending: false }),
      supabase.from('leads').select('id, name, business').order('created_at', { ascending: false }).limit(200),
    ])
    setProposals(propsData ?? [])
    setLeads(leadsData ?? [])

    // Load profile for the signed-in user. Was keyed on a localStorage id with
    // a `user_id is null` fallback, from before auth existed — owner-only RLS
    // makes user_id the only lookup that can return a row now.
    try {
      const { data: userData } = await supabase.auth.getUser()
      const uid = userData.user?.id
      if (uid) {
        const { data: p } = await supabase.from('profile').select('*').eq('user_id', uid).maybeSingle()
        if (p) { setProfile(p); localStorage.setItem('profile_id', p.id) }
      }
    } catch { /* no profile yet */ }
    setLoading(false)
  }

  async function handleStatusChange(id: string, status: string) {
    const { data } = await supabase.from('proposals').update({ status }).eq('id', id).select().single()
    if (data) setProposals(prev => prev.map(p => p.id === id ? { ...p, ...data } : p))
  }

  async function handleDelete(id: string) {
    await supabase.from('proposals').delete().eq('id', id)
    setProposals(prev => prev.filter(p => p.id !== id))
  }

  function copyLink(shareId: string) {
    navigator.clipboard.writeText(`${window.location.origin}/forslag/${shareId}`)
    setCopied(shareId)
    setTimeout(() => setCopied(null), 2000)
  }

  // Stats
  const today = new Date().toDateString()
  const todayCount = proposals.filter(p => new Date(p.created_at).toDateString() === today).length
  const sent = proposals.filter(p => ['sent', 'viewed', 'accepted'].includes(p.status))
  const viewed = sent.filter(p => (p.view_count ?? 0) > 0)
  const accepted = proposals.filter(p => p.status === 'accepted')
  const viewRate = sent.length > 0 ? Math.round((viewed.length / sent.length) * 100) : 0
  const closeRate = sent.length > 0 ? Math.round((accepted.length / sent.length) * 100) : 0

  const leadMap = Object.fromEntries(leads.map(l => [l.id, l]))

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <Panel padding="px-5 py-3" className="inline-block" enableTilt={false}>
          <p className="text-xs tracking-widest" style={{ color: 'var(--brick)' }}>AFFÄR</p>
          <h1 className="text-3xl font-bold mt-1" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
            📄 Förslag
          </h1>
        </Panel>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowProfile(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            ✎ Edit About Me
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'var(--brick)', color: 'white' }}
          >
            + Skapa förslag
          </button>
        </div>
      </div>

      {/* Daily goal + 4 stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="col-span-2 md:col-span-1">
          <DailyGoal todayCount={todayCount} />
        </div>
        <StatCard label="Total Sent" value={sent.length} />
        <StatCard label="View Rate" value={`${viewRate}%`} sub={`${viewed.length} av ${sent.length}`} />
        <StatCard label="Close Rate" value={`${closeRate}%`} sub={`${accepted.length} av ${sent.length}`} />
        <StatCard label="Accepted" value={accepted.length} />
      </div>

      {/* Table */}
      {loading ? (
        <Panel enableTilt={false}><p style={{ color: 'var(--slate)' }}>Laddar...</p></Panel>
      ) : proposals.length === 0 ? (
        <Panel className="text-center py-16" enableTilt={false}>
          <div className="text-5xl mb-4">📄</div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--cream)' }}>Inga förslag ännu</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>Skapa ett förslag och dela det med en prospekt — de ser det direkt i sin webbläsare.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-5 py-2 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'var(--brick)', color: 'white' }}
          >
            + Skapa förslag
          </button>
        </Panel>
      ) : (
        <Panel padding="p-0" className="overflow-hidden" enableTilt={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  {['Proposal', 'Business', 'Status', 'Created', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--slate)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {proposals.map((p, i) => {
                  const lead = p.lead_id ? leadMap[p.lead_id] : null
                  const st = STATUS_CONFIG[p.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.draft
                  return (
                    <tr
                      key={p.id}
                      style={{ borderBottom: i < proposals.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium" style={{ color: 'var(--cream)' }}>{p.title}</p>
                        {p.tagline && <p className="text-xs mt-0.5 truncate max-w-xs" style={{ color: 'var(--slate)' }}>{p.tagline}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--slate)' }}>
                        {lead?.business || lead?.name || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Dropdown
                          value={p.status}
                          onChange={v => handleStatusChange(p.id, v)}
                          className="text-xs px-2 py-1 rounded-full font-medium"
                          style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, borderRadius: 9999, padding: '4px 10px' }}
                          options={Object.entries(STATUS_CONFIG).map(([val, cfg]) => ({ value: val, label: cfg.label }))}
                        />
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--slate)' }}>
                        {new Date(p.created_at).toLocaleDateString('sv-SE')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 items-center">
                          <a
                            href={`/forslag/${p.share_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 rounded text-xs"
                            style={{ background: 'rgba(201,162,75,0.1)', color: 'var(--gold)', border: '1px solid rgba(201,162,75,0.25)', textDecoration: 'none' }}
                          >
                            Visa ↗
                          </a>
                          <button
                            onClick={() => copyLink(p.share_id)}
                            className="px-2 py-1 rounded text-xs"
                            style={{
                              background: copied === p.share_id ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)',
                              color: copied === p.share_id ? '#4ade80' : 'var(--slate)',
                              border: `1px solid ${copied === p.share_id ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.08)'}`,
                            }}
                          >
                            {copied === p.share_id ? '✓' : 'Kopiera'}
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="px-2 py-1 rounded text-xs"
                            style={{ background: 'rgba(168,85,247,0.1)', color: 'var(--brick)', border: '1px solid rgba(168,85,247,0.2)' }}
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {showCreate && <CreateProposalModal leads={leads} onClose={() => setShowCreate(false)} onCreated={p => { setProposals(prev => [p, ...prev]); setShowCreate(false) }} />}
      {showProfile && <EditAboutMeModal profile={profile} onClose={() => setShowProfile(false)} onSaved={p => { setProfile(p); setShowProfile(false) }} />}
    </div>
  )
}
