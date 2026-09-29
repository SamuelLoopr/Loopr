'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'
import Panel from '@/app/components/Panel'
import ToggleSwitch from '@/app/components/ToggleSwitch'
import ModeSwitch, { loadClientMode } from '@/app/components/ModeSwitch'
import { supabase } from '@/lib/supabase'
import { copyText } from '@/lib/clipboard'
import { isMissingColumn } from '@/lib/db-errors'
import { newShareId } from '@/lib/share-id'
import { SECTIONS, sectionFlags, type SectionFlags, type SectionKey } from '@/lib/master-sections'
import { CRM_GROUPS, clientStatusOf } from '@/lib/client-status'

// Bygg BOS for one client: which sections their page shows, the link, and a live
// preview of exactly what the client sees.
//
// The switches write agents.master_sections — the same column the Master Demo
// builder writes, because it is the same page. Missing content (SMS flow,
// audit, proposal) is created there; this view links across rather than
// duplicating those forms.

interface Agent {
  id: string
  name: string
  business_name: string | null
  public_share_id: string | null
  master_sections?: Record<string, boolean> | null
}

type Available = Record<SectionKey, boolean>

const MIGRATION_HINT =
  'Kolumnen master_sections saknas — kör migration 017_master_sections.sql i Supabase SQL Editor för att kunna spara sektionerna.'

const PREVIEW_WIDTHS = { desktop: '100%', mobile: '390px' } as const
type PreviewSize = keyof typeof PREVIEW_WIDTHS

export default function BosEditorPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = use(params)

  const [agent, setAgent] = useState<Agent | null>(null)
  const [enabled, setEnabled] = useState<SectionFlags>(sectionFlags(null))
  const [available, setAvailable] = useState<Available>({
    calls: false, voice: false, sms: false, audit: false, proposal: false, benefits: true,
  })
  const [hasNumber, setHasNumber] = useState(false)
  const [byGroup, setByGroup] = useState<Record<string, number> | null>(null)
  const [statusTracked, setStatusTracked] = useState(true)
  // agents.client_mode (029): null when the column does not exist yet.
  const [clientMode, setClientMode] = useState<boolean | null>(false)

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [sectionsUnsupported, setSectionsUnsupported] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [creatingLink, setCreatingLink] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  const [origin, setOrigin] = useState('')
  const [previewSize, setPreviewSize] = useState<PreviewSize>('desktop')
  const [previewKey, setPreviewKey] = useState(0)

  useEffect(() => setOrigin(window.location.origin), [])

  const load = useCallback(async () => {
    setLoading(true)

    let agentRes = await supabase
      .from('agents')
      .select('id, name, business_name, public_share_id, master_sections')
      .eq('id', agentId)
      .maybeSingle()
    if (agentRes.error && isMissingColumn(agentRes.error)) {
      setSectionsUnsupported(true)
      agentRes = await supabase
        .from('agents')
        .select('id, name, business_name, public_share_id')
        .eq('id', agentId)
        .maybeSingle() as typeof agentRes
    }

    const row = agentRes.data as Agent | null
    if (!row) { setNotFound(true); setLoading(false); return }
    setAgent(row)
    setEnabled(sectionFlags(row.master_sections))

    const [smsRes, auditRes, propRes, phoneRes, callsRes] = await Promise.all([
      supabase.from('review_clients').select('id', { count: 'exact', head: true }).eq('agent_id', agentId),
      supabase.from('audits').select('id', { count: 'exact', head: true }).eq('agent_id', agentId),
      supabase.from('proposals').select('id', { count: 'exact', head: true }).eq('agent_id', agentId),
      supabase.from('phone_numbers').select('id', { count: 'exact', head: true }).eq('agent_id', agentId),
      // Same test as the Master Demo builder: finished calls, or live ones the
      // public route can still complete from ElevenLabs.
      supabase.from('call_logs').select('id', { count: 'exact', head: true }).eq('agent_id', agentId)
        .or('status.eq.completed,and(status.eq.in_progress,error_message.like.*conversation_id=conv_*)'),
    ])

    setHasNumber((phoneRes.count ?? 0) > 0)
    setAvailable({
      calls: (callsRes.count ?? 0) > 0,
      voice: Boolean(row.public_share_id),
      sms: (smsRes.count ?? 0) > 0,
      audit: (auditRes.count ?? 0) > 0,
      proposal: (propRes.count ?? 0) > 0,
      benefits: true,
    })

    // The client's own follow-up, per CRM group. client_status arrives with
    // migration 028; before that there is nothing to count.
    const statusRes = await supabase
      .from('call_logs')
      .select('client_status')
      .eq('agent_id', agentId)
      .eq('status', 'completed')
    if (statusRes.error) {
      setStatusTracked(!isMissingColumn(statusRes.error))
      setByGroup(null)
    } else {
      setStatusTracked(true)
      const statuses = (statusRes.data ?? []).map(r => clientStatusOf(r.client_status))
      setByGroup(Object.fromEntries(CRM_GROUPS.map(g => [g.key, statuses.filter(s => g.statuses.includes(s)).length])))
    }

    setClientMode(await loadClientMode(agentId))
    setLoading(false)
  }, [agentId])

  useEffect(() => { load() }, [load])

  async function toggle(key: SectionKey) {
    const next = { ...enabled, [key]: !enabled[key] }
    setEnabled(next)
    if (sectionsUnsupported) return

    setSaving(true)
    setError('')
    const { error: e } = await supabase.from('agents').update({ master_sections: next }).eq('id', agentId)
    setSaving(false)
    if (e) {
      if (isMissingColumn(e)) setSectionsUnsupported(true)
      else setError(e.message)
      return
    }
    setSavedAt(new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }))
    // The preview is the real page, so it only changes once it reloads.
    setPreviewKey(k => k + 1)
  }

  async function createLink() {
    setCreatingLink(true)
    setError('')
    const shareId = newShareId()
    const { error: e } = await supabase.from('agents').update({ public_share_id: shareId }).eq('id', agentId)
    setCreatingLink(false)
    if (e) { setError(e.message); return }
    setAgent(prev => (prev ? { ...prev, public_share_id: shareId } : prev))
    setAvailable(prev => ({ ...prev, voice: true }))
  }

  const shareUrl = agent?.public_share_id ? `${origin}/master/${agent.public_share_id}` : ''

  async function handleCopy() {
    const ok = await copyText(shareUrl)
    if (!ok) { setCopyFailed(true); setTimeout(() => setCopyFailed(false), 3000); return }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <Panel padding="p-10" enableTilt={false}>
          <p className="text-sm text-center" style={{ color: 'var(--slate)' }}>Laddar…</p>
        </Panel>
      </div>
    )
  }

  if (notFound || !agent) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <Panel padding="p-10" enableTilt={false}>
          <p className="text-sm text-center mb-4" style={{ color: 'var(--slate)' }}>Klienten hittades inte.</p>
          <div className="text-center">
            <Link href="/bos" style={{ color: 'var(--brick)', fontSize: 13 }}>← Tillbaka till Bygg BOS</Link>
          </div>
        </Panel>
      </div>
    )
  }

  const title = agent.business_name || agent.name
  // In client mode the page is calls, calendar and account whatever the sales
  // switches say — those only apply to the demo.
  const salesHidden = clientMode === true
  const isSales = (key: SectionKey) => key !== 'calls'
  const shownCount = SECTIONS.filter(s => enabled[s.key] && available[s.key] && !(salesHidden && isSales(s.key))).length

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Link href="/bos" className="text-xs inline-block mb-4" style={{ color: 'var(--slate)' }}>
        ← Bygg BOS
      </Link>

      {/* ── Header + link ─────────────────────────────────────────────── */}
      <Panel padding="p-5" enableTilt={false} className="mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-widest uppercase mb-1" style={{ color: 'var(--brick)' }}>
              BOS · klientens sida
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold" style={{ color: 'var(--cream)', fontFamily: 'Arial, Helvetica, sans-serif' }}>
                {title}
              </h1>
              <Link
                href={`/ai-agents/receptionist/${agentId}?tab=settings`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg"
                style={{
                  color: 'var(--brick)', backgroundColor: 'rgba(168,85,247,0.12)',
                  border: '1px solid rgba(168,85,247,0.3)', textDecoration: 'none',
                }}
              >
                <span aria-hidden="true">⚙</span> Redigera receptionist
              </Link>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>
              {salesHidden
                ? `Klientläge · ${shownCount ? 'samtal, ' : ''}kalender och konto`
                : `Säljdemo · ${shownCount} av ${SECTIONS.length} sektioner visas`}
              {' · '}{hasNumber ? 'telefonnummer kopplat' : 'inget telefonnummer kopplat än'}
            </p>
            <div className="mt-3">
              <ModeSwitch
                agentId={agentId}
                value={clientMode}
                onChange={next => { setClientMode(next); setPreviewKey(k => k + 1) }}
              />
            </div>
          </div>

          {shareUrl ? (
            <div className="flex gap-2 flex-wrap shrink-0">
              <button
                onClick={handleCopy}
                style={{
                  borderRadius: 9, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  backgroundColor: copied ? 'rgba(74,222,128,0.15)' : 'var(--brick)',
                  color: copied ? '#4ade80' : 'white', border: copied ? '1px solid rgba(74,222,128,0.3)' : 'none',
                }}
              >
                {copied ? '✓ Kopierad' : copyFailed ? 'Kunde inte kopiera' : 'Kopiera klientens länk'}
              </button>
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  borderRadius: 9, padding: '10px 16px', fontSize: 13, fontWeight: 600, textDecoration: 'none',
                  color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.15)',
                }}
              >
                Öppna ↗
              </a>
            </div>
          ) : (
            <button
              onClick={createLink}
              disabled={creatingLink}
              style={{
                borderRadius: 9, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                backgroundColor: 'var(--brick)', color: 'white', border: 'none', opacity: creatingLink ? 0.6 : 1,
              }}
            >
              {creatingLink ? 'Skapar…' : 'Skapa klientens länk'}
            </button>
          )}
        </div>

        {shareUrl && (
          <p className="text-[11px] mt-3 break-all" style={{ color: 'var(--slate)' }}>
            {shareUrl} — alla med länken kan se samtalen och ändra status och anteckningar. Dela den bara med klienten.
          </p>
        )}
      </Panel>

      {(error || sectionsUnsupported) && (
        <Panel padding="p-4" enableTilt={false} className="mb-5">
          <p className="text-xs" style={{ color: sectionsUnsupported ? 'var(--gold)' : '#ef4444' }}>
            ⚠️ {sectionsUnsupported ? MIGRATION_HINT : error}
          </p>
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* ── Configuration ─────────────────────────────────────────────── */}
        <div className="space-y-5 min-w-0">
          <Panel padding="p-5" enableTilt={false}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-bold" style={{ color: 'var(--cream)' }}>Sektioner på klientens sida</h2>
              <span className="text-[11px]" style={{ color: 'var(--slate)' }}>
                {saving ? 'Sparar…' : savedAt ? `Sparat ${savedAt}` : ''}
              </span>
            </div>
            <p className="text-[11px] mb-4" style={{ color: 'var(--slate)' }}>
              Samma inställningar som i Master Demo — det är samma sida och samma länk.
            </p>

            <ul className="space-y-2">
              {salesHidden && (
                <li className="flex items-start gap-3 rounded-lg px-3 py-3" style={{
                  backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(96,165,250,0.25)',
                }}>
                  <span className="text-lg leading-none mt-0.5 shrink-0" aria-hidden="true">📅</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--cream)' }}>Kalender</p>
                    <p className="text-[11px] leading-relaxed mt-0.5" style={{ color: 'var(--slate)' }}>
                      Klientens egna bokningar — skapas från samtalen eller direkt i kalendern.
                    </p>
                    <p className="text-[11px] mt-1.5" style={{ color: '#4ade80' }}>✓ Alltid med i klientläge</p>
                  </div>
                </li>
              )}
              {SECTIONS.map(s => {
                const on = enabled[s.key]
                const hasData = available[s.key]
                const hiddenByMode = salesHidden && isSales(s.key)
                return (
                  <li
                    key={s.key}
                    className="flex items-start gap-3 rounded-lg px-3 py-3"
                    style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <span className="text-lg leading-none mt-0.5 shrink-0" aria-hidden="true">{s.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: 'var(--cream)' }}>{s.label}</p>
                      <p className="text-[11px] leading-relaxed mt-0.5" style={{ color: 'var(--slate)' }}>{s.blurb}</p>
                      <p className="text-[11px] mt-1.5" style={{ color: on && hasData && !hiddenByMode ? '#4ade80' : 'var(--slate)' }}>
                        {hiddenByMode
                          ? '○ Visas inte i klientläge'
                          : !hasData
                          ? s.external
                            ? '○ Inga samtal än — dyker upp av sig själv efter första riktiga samtalet'
                            : s.key === 'voice'
                              ? '○ Kräver klientens länk'
                              : <>○ Inget innehåll — <Link href={`/master-demo/${agentId}`} style={{ color: 'var(--brick)' }}>skapa i Master Demo-byggaren →</Link></>
                          : on ? '✓ Visas' : '○ Avstängd'}
                      </p>
                    </div>
                    <ToggleSwitch on={on} onToggle={() => toggle(s.key)} label={s.label} disabled={saving || hiddenByMode} />
                  </li>
                )
              })}
            </ul>
          </Panel>

          <Panel padding="p-5" enableTilt={false}>
            <h2 className="text-sm font-bold mb-1" style={{ color: 'var(--cream)' }}>Klientens uppföljning</h2>
            <p className="text-[11px] mb-4" style={{ color: 'var(--slate)' }}>
              Status som klienten själv sätter på sina samtal.
            </p>
            {byGroup ? (
              <div className="grid grid-cols-2 gap-2">
                {CRM_GROUPS.map(g => (
                  <div key={g.key} className="rounded-lg px-3 py-2.5" style={{
                    backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                  }}>
                    <p className="text-xl font-bold" style={{ color: g.key === 'nya' && byGroup[g.key] ? 'var(--brick)' : 'var(--cream)' }}>
                      {byGroup[g.key]}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--slate)' }}>{g.label}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--gold)' }}>
                {statusTracked
                  ? 'Kunde inte läsa statusen just nu.'
                  : 'Status och anteckningar kräver migration 028_bos_client_crm.sql — kör den i Supabase SQL Editor.'}
              </p>
            )}
          </Panel>
        </div>

        {/* ── Live preview ──────────────────────────────────────────────── */}
        <Panel padding="p-4" enableTilt={false} className="min-w-0">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--cream)' }}>Förhandsgranskning</h2>
              <p className="text-[11px]" style={{ color: 'var(--slate)' }}>
                Klientens riktiga sida, live — status och anteckningar du ändrar här sparas på riktigt.
              </p>
            </div>
            {shareUrl && (
              <div className="flex items-center gap-1.5">
                {(['desktop', 'mobile'] as const).map(size => (
                  <button
                    key={size}
                    type="button"
                    aria-pressed={previewSize === size}
                    onClick={() => setPreviewSize(size)}
                    className="text-[11px] font-semibold rounded-md"
                    style={{
                      padding: '5px 10px', cursor: 'pointer',
                      backgroundColor: previewSize === size ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.05)',
                      color: previewSize === size ? 'var(--cream)' : 'var(--slate)',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    {size === 'desktop' ? 'Dator' : 'Mobil'}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPreviewKey(k => k + 1)}
                  className="text-[11px] font-semibold rounded-md"
                  style={{
                    padding: '5px 10px', cursor: 'pointer', color: 'var(--slate)',
                    backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  }}
                  title="Ladda om förhandsgranskningen"
                >
                  ↻
                </button>
              </div>
            )}
          </div>

          {shareUrl ? (
            <div className="rounded-xl overflow-hidden flex justify-center" style={{
              backgroundColor: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <iframe
                key={`${previewKey}-${previewSize}`}
                src={`/master/${agent.public_share_id}`}
                title={`Förhandsgranskning av BOS för ${title}`}
                style={{
                  width: PREVIEW_WIDTHS[previewSize], maxWidth: '100%', height: 820, border: 'none',
                  backgroundColor: '#0f0f0f',
                }}
              />
            </div>
          ) : (
            <p className="text-sm text-center py-16" style={{ color: 'var(--slate)' }}>
              Skapa klientens länk först — sedan visas sidan här.
            </p>
          )}
        </Panel>
      </div>
    </div>
  )
}
