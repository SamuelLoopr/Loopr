'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'
import Panel from '@/app/components/Panel'
import Dropdown from '@/app/components/Dropdown'
import { supabase } from '@/lib/supabase'
import { copyText } from '@/lib/clipboard'

// ─── Types ────────────────────────────────────────────────────────────────────
type SectionKey = 'voice' | 'sms' | 'audit' | 'proposal' | 'benefits'

interface SectionDef {
  key: SectionKey
  icon: string
  label: string
  blurb: string
  /** Sections with no backing row — they can never be "missing data". */
  alwaysAvailable?: boolean
}

const SECTIONS: SectionDef[] = [
  { key: 'voice',    icon: '🎙️', label: 'Röstdemo',            blurb: 'Prospekten ringer AI-receptionisten direkt i webbläsaren.' },
  { key: 'sms',      icon: '💬', label: 'SMS-recensionsflöde', blurb: 'Klickbar simulering av recensionsautomationen.' },
  { key: 'audit',    icon: '📊', label: 'Audit-höjdpunkter',   blurb: 'Synlighetspoäng och de största förbättringsmöjligheterna.' },
  { key: 'proposal', icon: '📄', label: 'Förslag',             blurb: 'Värdesumma och länk till hela förslaget.' },
  { key: 'benefits', icon: '✨', label: 'Varför Loopr',        blurb: 'Fyra fördelskort — säljargumenten.', alwaysAvailable: true },
]

interface Agent {
  id: string
  name: string
  business_name: string | null
  lead_id: string | null
  public_share_id: string | null
}

interface Lead {
  business: string | null
  website: string | null
}

interface Available {
  sms: { share_id: string; business_name: string } | null
  audit: { share_id: string; visibility_score: number | null } | null
  proposal: { share_id: string; title: string; avg_job_value: number | null } | null
}

const MIGRATION_HINT =
  'Kolumnen master_sections saknas — kör migration 017_master_sections.sql i Supabase SQL Editor för att kunna spara vilka sektioner som ska visas.'

const DEFAULT_SMS_TEMPLATE =
  'Hej {{kund_namn}}, tack för att du valde {{företag}}! Vi skulle uppskatta en snabb recension på Google: {{review_url}}'

const DELAYS = [
  { value: '15', label: '15 minuter' },
  { value: '30', label: '30 minuter' },
  { value: '60', label: '1 timme' },
  { value: '180', label: '3 timmar' },
  { value: '1440', label: '1 dygn' },
]

function genShareId() {
  return Math.random().toString(36).substring(2, 10)
}

export default function MasterDemoBuilderPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = use(params)

  const [agent, setAgent] = useState<Agent | null>(null)
  const [lead, setLead] = useState<Lead | null>(null)
  const [available, setAvailable] = useState<Available>({ sms: null, audit: null, proposal: null })
  const [enabled, setEnabled] = useState<Record<SectionKey, boolean>>({
    voice: true, sms: true, audit: true, proposal: true, benefits: true,
  })
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [sectionsUnsupported, setSectionsUnsupported] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  // ── Inline creation state ─────────────────────────────────────────────
  const [openForm, setOpenForm] = useState<SectionKey | null>(null)
  const [busy, setBusy] = useState<SectionKey | null>(null)
  const [formError, setFormError] = useState<Partial<Record<SectionKey, string>>>({})

  const [smsUrl, setSmsUrl] = useState('')
  const [smsDelay, setSmsDelay] = useState('30')
  const [auditUrl, setAuditUrl] = useState('')
  const [propTitle, setPropTitle] = useState('')
  const [propTagline, setPropTagline] = useState('AI-receptionist som svarar på varje samtal, dygnet runt.')
  const [propValue, setPropValue] = useState('')

  useEffect(() => setOrigin(window.location.origin), [])

  const load = useCallback(async () => {
    setLoading(true)

    // master_sections needs migration 017 — fall back so the builder still works.
    let agentRow: (Agent & { master_sections?: Record<string, boolean> | null }) | null = null
    const withSections = await supabase
      .from('agents')
      .select('id, name, business_name, lead_id, public_share_id, master_sections')
      .eq('id', agentId)
      .maybeSingle()

    if (withSections.error && withSections.error.message.includes('master_sections')) {
      setSectionsUnsupported(true)
      const base = await supabase
        .from('agents')
        .select('id, name, business_name, lead_id, public_share_id')
        .eq('id', agentId)
        .maybeSingle()
      agentRow = base.data
    } else {
      agentRow = withSections.data
    }

    if (!agentRow) { setNotFound(true); setLoading(false); return }
    setAgent(agentRow)

    const stored = agentRow.master_sections
    if (stored) {
      setEnabled(prev => ({
        voice: stored.voice ?? prev.voice,
        sms: stored.sms ?? prev.sms,
        audit: stored.audit ?? prev.audit,
        proposal: stored.proposal ?? prev.proposal,
        benefits: stored.benefits ?? prev.benefits,
      }))
    }

    const [leadRes, smsRes, auditRes, propRes] = await Promise.all([
      agentRow.lead_id
        ? supabase.from('leads').select('business, website').eq('id', agentRow.lead_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('review_clients').select('share_id, business_name').eq('agent_id', agentId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('audits').select('share_id, content').eq('agent_id', agentId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('proposals').select('share_id, title, avg_job_value').eq('agent_id', agentId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    setLead(leadRes.data)
    setAvailable({
      sms: smsRes.data ?? null,
      audit: auditRes.data
        ? {
            share_id: auditRes.data.share_id,
            visibility_score: (auditRes.data.content as { visibility_score?: number } | null)?.visibility_score ?? null,
          }
        : null,
      proposal: propRes.data ?? null,
    })

    // Seed the inline forms from what we know about the client.
    const display = agentRow.business_name || leadRes.data?.business || agentRow.name
    setAuditUrl(prev => prev || leadRes.data?.website || '')
    setPropTitle(prev => prev || `Förslag till ${display}`)

    setLoading(false)
  }, [agentId])

  useEffect(() => { load() }, [load])

  const shareUrl = agent?.public_share_id ? `${origin}/master/${agent.public_share_id}` : ''
  const displayName = agent ? (agent.business_name || lead?.business || agent.name) : ''

  function setErr(key: SectionKey, message: string) {
    setFormError(prev => ({ ...prev, [key]: message }))
  }

  // ── Creators ──────────────────────────────────────────────────────────
  // Every one of these writes agent_id (and lead_id) so the row shows up in
  // this agent's Master Demo immediately.

  async function activateVoice() {
    setBusy('voice')
    setErr('voice', '')
    const shareId = genShareId() + Math.random().toString(36).substring(2, 6)
    const { error: e } = await supabase.from('agents').update({ public_share_id: shareId }).eq('id', agentId)
    if (e) {
      setErr('voice', e.message.includes('public_share_id')
        ? 'Kolumnen public_share_id saknas — kör migration 014_agent_public_demo.sql först.'
        : e.message)
    } else {
      setAgent(prev => (prev ? { ...prev, public_share_id: shareId } : prev))
    }
    setBusy(null)
  }

  async function createSms() {
    const url = smsUrl.trim()
    if (!url) { setErr('sms', 'Google-recensionslänk krävs'); return }
    if (!url.startsWith('https://g.page') && !url.startsWith('https://search.google.com')) {
      setErr('sms', 'URL måste börja med https://g.page eller https://search.google.com')
      return
    }
    setBusy('sms')
    setErr('sms', '')
    const { error: e } = await supabase.from('review_clients').insert({
      business_name: displayName,
      google_review_url: url,
      delay_minutes: Number(smsDelay),
      message_template: DEFAULT_SMS_TEMPLATE,
      share_id: genShareId(),
      demo_generated_at: new Date().toISOString(),
      agent_id: agentId,
      lead_id: agent?.lead_id ?? null,
    })
    setBusy(null)
    if (e) { setErr('sms', e.message); return }
    setOpenForm(null)
    await load()
  }

  async function createAudit() {
    const url = auditUrl.trim()
    if (!url) { setErr('audit', 'Webbplats krävs för att kunna analysera'); return }
    setBusy('audit')
    setErr('audit', '')
    try {
      const res = await fetch('/api/generate-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: displayName,
          websiteUrl: url,
          agentId,
          leadId: agent?.lead_id ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kunde inte generera audit')
      setOpenForm(null)
      await load()
    } catch (err) {
      setErr('audit', err instanceof Error ? err.message : String(err))
    }
    setBusy(null)
  }

  async function createProposal() {
    if (!propTitle.trim()) { setErr('proposal', 'Rubrik krävs'); return }
    setBusy('proposal')
    setErr('proposal', '')
    const { error: e } = await supabase.from('proposals').insert({
      title: propTitle.trim(),
      tagline: propTagline.trim() || null,
      avg_job_value: propValue ? Number(propValue) : null,
      is_public: true,
      status: 'draft',
      share_id: genShareId(),
      agent_id: agentId,
      lead_id: agent?.lead_id ?? null,
    })
    setBusy(null)
    if (e) { setErr('proposal', e.message); return }
    setOpenForm(null)
    await load()
  }

  async function toggle(key: SectionKey) {
    const next = { ...enabled, [key]: !enabled[key] }
    setEnabled(next)
    if (sectionsUnsupported) return

    setSaving(true)
    setError('')
    const { error: e } = await supabase.from('agents').update({ master_sections: next }).eq('id', agentId)
    if (e) {
      if (e.message.includes('master_sections')) setSectionsUnsupported(true)
      else setError(e.message)
    } else {
      setSavedAt(new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }))
    }
    setSaving(false)
  }

  async function handleCopy() {
    const ok = await copyText(shareUrl)
    if (!ok) { setCopyFailed(true); setTimeout(() => setCopyFailed(false), 3000); return }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function hasData(key: SectionKey): boolean {
    if (key === 'benefits') return true
    if (key === 'voice') return Boolean(agent?.public_share_id)
    return Boolean(available[key as 'sms' | 'audit' | 'proposal'])
  }

  function willShow(key: SectionKey): boolean {
    return enabled[key] && hasData(key)
  }

  // ── Styles ────────────────────────────────────────────────────────────
  const btn: React.CSSProperties = {
    borderRadius: 9, padding: '10px 16px', fontSize: 13, fontWeight: 600,
    whiteSpace: 'nowrap', transition: 'all 0.2s',
  }
  const smallBtn: React.CSSProperties = {
    borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  }
  const brickBtn: React.CSSProperties = {
    ...smallBtn,
    backgroundColor: 'rgba(168,85,247,0.15)',
    color: 'var(--brick)',
    border: '1px solid rgba(168,85,247,0.25)',
  }
  const ghostBtn: React.CSSProperties = {
    ...smallBtn,
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: 'var(--slate)',
    border: '1px solid rgba(255,255,255,0.1)',
  }
  const field: React.CSSProperties = {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'var(--cream)',
    borderRadius: 8,
    padding: '8px 11px',
    fontSize: 13,
    outline: 'none',
  }

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <Panel padding="p-10" tiltMaxAngle={3}>
          <p className="text-sm text-center" style={{ color: 'var(--slate)' }}>Laddar…</p>
        </Panel>
      </div>
    )
  }

  if (notFound || !agent) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <Panel padding="p-10" tiltMaxAngle={3}>
          <p className="text-sm text-center mb-4" style={{ color: 'var(--slate)' }}>Agenten hittades inte.</p>
          <div className="text-center">
            <Link href="/master-demo" style={{ color: 'var(--brick)', fontSize: 13 }}>← Tillbaka till Master Demo</Link>
          </div>
        </Panel>
      </div>
    )
  }

  const visibleCount = SECTIONS.filter(s => willShow(s.key)).length
  const missing = SECTIONS.filter(s => !s.alwaysAvailable && !hasData(s.key))

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link href="/master-demo" className="text-xs inline-block mb-4" style={{ color: 'var(--slate)' }}>
        ← Master Demo
      </Link>

      {/* ── Link bar (wide → low tilt) ─────────────────────────────────── */}
      <Panel padding="p-5" enableTilt={false} className="mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-widest uppercase mb-1" style={{ color: 'var(--brick)' }}>
              Master Demo
            </p>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--cream)', fontFamily: 'Arial, Helvetica, sans-serif' }}>
              {displayName}
            </h1>
            <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>
              {visibleCount} av {SECTIONS.length} sektioner visas för prospekten
              {missing.length > 0 && ` · saknar ${missing.map(m => m.label).join(', ').toLowerCase()}`}
            </p>
          </div>

          <div className="flex gap-2 flex-wrap shrink-0">
            {shareUrl ? (
              <>
                <button
                  onClick={handleCopy}
                  style={{
                    ...btn,
                    backgroundColor: copied ? 'rgba(74,222,128,0.15)' : copyFailed ? 'rgba(239,68,68,0.12)' : 'var(--brick)',
                    color: copied ? '#4ade80' : copyFailed ? '#ef4444' : 'white',
                    border: copied ? '1px solid rgba(74,222,128,0.3)' : copyFailed ? '1px solid rgba(239,68,68,0.3)' : 'none',
                  }}
                >
                  {copied ? '✓ Kopierad' : copyFailed ? '⚠️ Blockerad' : '📋 Kopiera länk'}
                </button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    ...btn, display: 'inline-block', textDecoration: 'none',
                    backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--slate)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  Öppna publik sida ↗
                </a>
              </>
            ) : (
              <button
                onClick={activateVoice}
                disabled={busy === 'voice'}
                style={{ ...btn, backgroundColor: 'var(--brick)', color: 'white', border: 'none', opacity: busy === 'voice' ? 0.5 : 1 }}
              >
                {busy === 'voice' ? '⟳ Skapar…' : '🔗 Generera länk'}
              </button>
            )}
          </div>
        </div>

        {shareUrl ? (
          <code
            className="block truncate text-[11px] px-3 py-2 rounded-lg"
            style={{
              backgroundColor: 'rgba(168,85,247,0.08)',
              border: '1px solid rgba(168,85,247,0.25)',
              color: 'var(--cream)',
            }}
          >
            {shareUrl}
          </code>
        ) : (
          <p className="text-xs" style={{ color: 'var(--slate)' }}>
            Ingen publik länk än. Generera en så kan du skicka hela paketet till kunden i ett svep —
            samma länk driver även röstdemon på /prova.
          </p>
        )}

        {error && <p className="text-[11px] mt-3" style={{ color: '#ef4444' }}>⚠️ {error}</p>}
      </Panel>

      {sectionsUnsupported && (
        <Panel padding="p-4" tiltMaxAngle={3} glowColor="201, 162, 75" className="mb-5">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--gold)' }}>
            ⚠️ {MIGRATION_HINT} Du kan bocka i och ur nedan för att se förhandsgranskningen, men valen
            sparas inte och den publika sidan visar allt som har data.
          </p>
        </Panel>
      )}

      {/* ── Section picker + inline creation ──────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold" style={{ color: 'var(--cream)' }}>Sektioner</h2>
        <span className="text-[11px]" style={{ color: 'var(--slate)' }}>
          {saving ? 'Sparar…' : savedAt ? `Sparat ${savedAt}` : ''}
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {SECTIONS.map(s => {
          const on = enabled[s.key]
          const data = hasData(s.key)
          const shows = willShow(s.key)
          const isBusy = busy === s.key
          const formOpen = openForm === s.key

          return (
            <Panel key={s.key} padding="p-5" enableTilt={false}>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-lg shrink-0">{s.icon}</span>
                  <h3 className="text-sm font-bold truncate" style={{ color: 'var(--cream)' }}>{s.label}</h3>
                </div>

                <button
                  onClick={() => toggle(s.key)}
                  role="switch"
                  aria-checked={on}
                  aria-label={`${s.label} ${on ? 'på' : 'av'}`}
                  className="shrink-0"
                  style={{
                    width: 42, height: 24, borderRadius: 12, position: 'relative',
                    background: on ? 'var(--brick)' : 'rgba(255,255,255,0.1)',
                    border: `1px solid ${on ? 'rgba(168,85,247,0.5)' : 'rgba(255,255,255,0.15)'}`,
                    cursor: 'pointer', transition: 'background 0.2s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2, left: on ? 20 : 2,
                    width: 18, height: 18, borderRadius: '50%',
                    background: 'white', transition: 'left 0.2s',
                  }} />
                </button>
              </div>

              <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--slate)' }}>{s.blurb}</p>

              {/* Status line */}
              <div
                className="text-[11px] px-3 py-2 rounded-lg mb-3"
                style={{
                  backgroundColor: shows ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${shows ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.08)'}`,
                  color: shows ? '#4ade80' : 'var(--slate)',
                }}
              >
                {!data
                  ? '○ Ingen data kopplad — skapa den nedan'
                  : !on
                    ? '○ Avstängd — visas inte för prospekten'
                    : s.key === 'audit' && available.audit
                      ? `✓ Visas · synlighetspoäng ${available.audit.visibility_score ?? '—'}`
                      : s.key === 'proposal' && available.proposal
                        ? `✓ Visas · ${available.proposal.title}`
                        : s.key === 'sms' && available.sms
                          ? `✓ Visas · ${available.sms.business_name}`
                          : '✓ Visas'}
              </div>

              {/* ── Inline creation for whatever is missing ───────────── */}
              {!data && s.key === 'voice' && (
                <button onClick={activateVoice} disabled={isBusy} style={{ ...brickBtn, width: '100%', opacity: isBusy ? 0.5 : 1 }}>
                  {isBusy ? '⟳ Aktiverar…' : '🎙 Aktivera röstdemo'}
                </button>
              )}

              {!data && s.key === 'sms' && (
                formOpen ? (
                  <div className="space-y-2">
                    <input
                      value={smsUrl}
                      onChange={e => setSmsUrl(e.target.value)}
                      placeholder="https://g.page/r/…"
                      autoFocus
                      style={field}
                    />
                    <Dropdown value={smsDelay} onChange={setSmsDelay} options={DELAYS} style={{ width: '100%' }} />
                    <p className="text-[10.5px]" style={{ color: 'var(--slate)' }}>
                      Skapas som recensionsklient för {displayName}, kopplad till den här agenten.
                    </p>
                    <div className="flex gap-2">
                      <button onClick={createSms} disabled={isBusy} style={{ ...brickBtn, opacity: isBusy ? 0.5 : 1 }}>
                        {isBusy ? '⟳ Skapar…' : 'Skapa'}
                      </button>
                      <button onClick={() => { setOpenForm(null); setErr('sms', '') }} style={ghostBtn}>Avbryt</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setOpenForm('sms')} style={{ ...brickBtn, width: '100%' }}>
                    💬 Skapa recensionsklient
                  </button>
                )
              )}

              {!data && s.key === 'audit' && (
                formOpen ? (
                  <div className="space-y-2">
                    <input
                      value={auditUrl}
                      onChange={e => setAuditUrl(e.target.value)}
                      placeholder="exempel.se"
                      autoFocus
                      style={field}
                    />
                    <p className="text-[10.5px]" style={{ color: 'var(--slate)' }}>
                      {lead?.website
                        ? 'Förifylld från leadens webbplats. AI:n analyserar sidan — tar ~15 sekunder.'
                        : 'Ingen webbplats på leaden — fyll i en. AI:n analyserar sidan — tar ~15 sekunder.'}
                    </p>
                    <div className="flex gap-2">
                      <button onClick={createAudit} disabled={isBusy} style={{ ...brickBtn, opacity: isBusy ? 0.5 : 1 }}>
                        {isBusy ? '⟳ Analyserar…' : 'Generera'}
                      </button>
                      <button onClick={() => { setOpenForm(null); setErr('audit', '') }} style={ghostBtn}>Avbryt</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setOpenForm('audit')} style={{ ...brickBtn, width: '100%' }}>
                    📊 Generera audit
                  </button>
                )
              )}

              {!data && s.key === 'proposal' && (
                formOpen ? (
                  <div className="space-y-2">
                    <input value={propTitle} onChange={e => setPropTitle(e.target.value)} placeholder="Rubrik" autoFocus style={field} />
                    <input value={propTagline} onChange={e => setPropTagline(e.target.value)} placeholder="Kort beskrivning" style={field} />
                    <input
                      value={propValue}
                      onChange={e => setPropValue(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="Uppskattat värde i kr (valfritt)"
                      inputMode="numeric"
                      style={field}
                    />
                    <div className="flex gap-2">
                      <button onClick={createProposal} disabled={isBusy} style={{ ...brickBtn, opacity: isBusy ? 0.5 : 1 }}>
                        {isBusy ? '⟳ Skapar…' : 'Skapa'}
                      </button>
                      <button onClick={() => { setOpenForm(null); setErr('proposal', '') }} style={ghostBtn}>Avbryt</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setOpenForm('proposal')} style={{ ...brickBtn, width: '100%' }}>
                    📄 Skapa förslag
                  </button>
                )
              )}

              {formError[s.key] && (
                <p className="text-[11px] mt-2" style={{ color: '#ef4444' }}>⚠️ {formError[s.key]}</p>
              )}
            </Panel>
          )
        })}
      </div>

      {/* ── Preview of the public page order ──────────────────────────── */}
      <Panel padding="p-5" tiltMaxAngle={4}>
        <p className="text-[10px] font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--slate)' }}>
          Förhandsgranskning — så här scrollar prospekten
        </p>
        <ol className="space-y-2">
          {[
            { label: `Hero — "Hej ${displayName}!"`, always: true },
            ...SECTIONS.filter(s => s.key !== 'benefits').map(s => ({ label: s.label, key: s.key, always: false })),
            { label: 'Varför Loopr', key: 'benefits' as SectionKey, always: false },
            { label: 'Avslutande CTA — boka kostnadsfri demo', always: true },
          ].map((step, i) => {
            const shown = step.always || willShow((step as { key: SectionKey }).key)
            return (
              <li key={i} className="flex items-center gap-3">
                <span
                  className="shrink-0 flex items-center justify-center text-[10px] font-bold"
                  style={{
                    width: 20, height: 20, borderRadius: 6,
                    background: shown ? 'rgba(168,85,247,0.18)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${shown ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    color: shown ? 'var(--brick)' : 'var(--slate)',
                  }}
                >
                  {shown ? '✓' : '–'}
                </span>
                <span
                  className="text-xs"
                  style={{
                    color: shown ? 'var(--cream)' : 'var(--slate)',
                    textDecoration: shown ? 'none' : 'line-through',
                    opacity: shown ? 1 : 0.5,
                  }}
                >
                  {step.label}
                </span>
              </li>
            )
          })}
        </ol>
      </Panel>
    </div>
  )
}
