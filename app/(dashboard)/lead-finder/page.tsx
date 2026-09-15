'use client'

import { useState, useEffect, useRef } from 'react'
import Panel from '../../components/Panel'
import Dropdown from '../../components/Dropdown'
import { supabase } from '@/lib/supabase'
import { LEAD_STATUS } from '@/lib/lead-status'
import type { LeadResult } from '@/app/api/search-leads/route'

// ─── Constants ────────────────────────────────────────────────────────────────
const SCRAPE_LIMIT = 1000
const CURRENT_MONTH = new Date().toISOString().slice(0, 7) // 'YYYY-MM'

const RADIUS_OPTIONS = [5, 10, 15, 25]
const MAX_RESULTS_OPTIONS = [10, 25, 50, 100, 200]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function scoreColor(score: number): string {
  if (score >= 80) return '#4ade80'
  if (score >= 60) return 'var(--gold)'
  if (score >= 40) return 'var(--slate)'
  return '#ef4444'
}

function scoreLabel(score: number): string {
  if (score >= 80) return 'Utmärkt'
  if (score >= 60) return 'Bra'
  if (score >= 40) return 'Okej'
  return 'Svag'
}

// ─── Lead Card ────────────────────────────────────────────────────────────────
function LeadCard({ lead, onAddCrm, initiallyAdded = false, unscored = false, isManual = false, note }: {
  lead: LeadResult
  onAddCrm: (l: LeadResult) => Promise<string | null>
  /** History rows already pushed to the CRM render as added, so they can't be duplicated. */
  initiallyAdded?: boolean
  /** Manual leads never went through Claude, so there is no score to show. */
  unscored?: boolean
  isManual?: boolean
  note?: string | null
}) {
  const [added, setAdded] = useState(initiallyAdded)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  async function handleAdd() {
    setAdding(true)
    setAddError(null)
    const err = await onAddCrm(lead)
    if (err) {
      setAddError(err)
    } else {
      setAdded(true)
    }
    setAdding(false)
  }

  return (
    <Panel padding="p-4" className="flex flex-col gap-3" magic={false}>
      {/* Header row — magic={false}: this card renders once per search result
          (unbounded list), full MagicBento would spawn a spotlight/particle
          listener per row and tank scroll perf */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
            {lead.name}
          </h3>
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--slate)' }}>{lead.address}</p>
          {isManual && (
            <span
              className="inline-block mt-1 text-[9px] font-semibold px-1.5 py-0.5 rounded"
              style={{
                color: 'var(--gold)',
                backgroundColor: 'rgba(201,162,75,0.12)',
                border: '1px solid rgba(201,162,75,0.28)',
              }}
            >
              ✋ Manuellt tillagd
            </span>
          )}
          {note && (
            <p className="text-[11px] mt-1.5 whitespace-pre-wrap" style={{ color: 'rgba(255,255,255,0.45)' }}>
              {note}
            </p>
          )}
        </div>
        {/* AI Score badge — or a plain marker when there is no score */}
        <div className="shrink-0 flex flex-col items-center">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold"
            style={
              unscored
                ? { border: '2px dashed rgba(255,255,255,0.2)', color: 'var(--slate)', fontSize: 16 }
                : { border: `2px solid ${scoreColor(lead.ai_score)}`, color: scoreColor(lead.ai_score) }
            }
          >
            {unscored ? '–' : lead.ai_score}
          </div>
          <span
            className="text-[9px] mt-0.5 text-center leading-tight"
            style={{ color: unscored ? 'var(--slate)' : scoreColor(lead.ai_score) }}
          >
            {unscored ? 'Ej poängsatt' : scoreLabel(lead.ai_score)}
          </span>
        </div>
      </div>

      {/* AI reason */}
      {lead.ai_reason && (
        <p className="text-xs italic" style={{ color: 'var(--slate)' }}>{lead.ai_reason}</p>
      )}

      {/* Details */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {lead.phone && (
          <div className="flex items-center gap-1.5 truncate">
            <span style={{ color: 'var(--slate)' }}>📞</span>
            <a href={`tel:${lead.phone}`} className="truncate hover:underline" style={{ color: 'var(--cream)' }}>
              {lead.phone}
            </a>
          </div>
        )}
        {lead.website && (
          <div className="flex items-center gap-1.5 truncate">
            <span style={{ color: 'var(--slate)' }}>🌐</span>
            <a
              href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate hover:underline"
              style={{ color: 'var(--cream)' }}
            >
              {lead.website.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          </div>
        )}
        {lead.rating != null && (
          <div className="flex items-center gap-1.5">
            <span style={{ color: 'var(--gold)' }}>★</span>
            <span style={{ color: 'var(--cream)' }}>{lead.rating.toFixed(1)}</span>
            <span style={{ color: 'var(--slate)' }}>({lead.total_ratings})</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <a
            href={lead.maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ color: 'var(--brick)' }}
          >
            Visa på Maps →
          </a>
        </div>
      </div>

      {/* Action */}
      <div className="pt-1 border-t flex flex-col gap-1.5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {addError && (
          <p className="text-[10px] px-1" style={{ color: '#ef4444' }}>⚠️ {addError}</p>
        )}
        <div className="flex items-center justify-end">
          <button
            onClick={handleAdd}
            disabled={added || adding}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
            style={{
              backgroundColor: added ? 'rgba(74,222,128,0.1)' : addError ? 'rgba(239,68,68,0.1)' : 'rgba(168,85,247,0.2)',
              color: added ? '#4ade80' : addError ? '#ef4444' : 'var(--brick)',
              border: `1px solid ${added ? 'rgba(74,222,128,0.3)' : addError ? 'rgba(239,68,68,0.3)' : 'rgba(168,85,247,0.3)'}`,
              cursor: added ? 'default' : 'pointer',
            }}
          >
            {adding ? 'Lägger till…' : added ? '✓ Tillagd i CRM' : addError ? '↺ Försök igen' : '+ Lägg till CRM'}
          </button>
        </div>
      </div>
    </Panel>
  )
}

// ─── Saved search history (migration 020) ─────────────────────────────────────

interface SavedSearch {
  id: string
  industry: string | null
  location: string | null
  country: string | null
  result_count: number
  created_at: string
}

interface SavedResult {
  id: string
  business_name: string | null
  address: string | null
  phone: string | null
  website: string | null
  rating: number | null
  review_count: number | null
  ai_score: number | null
  added_to_crm: boolean
  place_id: string | null
  ai_reason: string | null
  maps_url: string | null
  source: string | null
  notes: string | null
}

/** Saved row → the shape LeadCard already renders, so history reuses the same card. */
function toLeadResult(r: SavedResult): LeadResult {
  return {
    place_id: r.place_id ?? r.id,
    name: r.business_name ?? '(namn saknas)',
    address: r.address ?? '',
    phone: r.phone ?? '',
    website: r.website ?? '',
    rating: r.rating,
    total_ratings: r.review_count ?? 0,
    ai_score: r.ai_score ?? 0,
    ai_reason: r.ai_reason ?? '',
    maps_url: r.maps_url ?? '',
  }
}

function formatSearchDate(iso: string): string {
  return new Date(iso).toLocaleString('sv-SE', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LeadFinderPage() {
  // Source toggle
  const [source, setSource] = useState<'google' | 'indeed'>('google')

  // Scrape usage
  const [scrapeCount, setScrapeCount] = useState(0)
  const deviceId = useRef<string>('')

  // Search form
  const [icp, setIcp] = useState('')
  const [country, setCountry] = useState('sverige')
  const [location, setLocation] = useState('')
  const [industry, setIndustry] = useState('')
  const [radius, setRadius] = useState(10)
  const [maxResults, setMaxResults] = useState(25)

  // UI state
  const [generatingIcp, setGeneratingIcp] = useState(false)
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<LeadResult[]>([])
  const [searchDone, setSearchDone] = useState(false)
  const [mockWarning, setMockWarning] = useState('')
  const [error, setError] = useState('')

  // Search history (migration 020). currentSearchId is the row this page's live
  // results were saved under, so adding one to the CRM can flag it there too.
  const [view, setView] = useState<'search' | 'history' | 'manual'>('search')

  // Manual lead entry
  const [showManualForm, setShowManualForm] = useState(false)
  const [mBusiness, setMBusiness] = useState('')
  const [mAddress, setMAddress] = useState('')
  const [mPhone, setMPhone] = useState('')
  const [mWebsite, setMWebsite] = useState('')
  const [mNote, setMNote] = useState('')
  const [mSaving, setMSaving] = useState(false)
  const [mError, setMError] = useState('')
  const [manualLeads, setManualLeads] = useState<SavedResult[]>([])
  const [manualLoading, setManualLoading] = useState(false)
  const [currentSearchId, setCurrentSearchId] = useState<string | null>(null)
  const [searches, setSearches] = useState<SavedSearch[]>([])
  const [searchesLoading, setSearchesLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [openSearch, setOpenSearch] = useState<SavedSearch | null>(null)
  const [openResults, setOpenResults] = useState<SavedResult[]>([])
  const [openLoading, setOpenLoading] = useState(false)

  // ── Init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let id = localStorage.getItem('loopr_device_id')
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('loopr_device_id', id) }
    deviceId.current = id
    fetchScrapeUsage(id)
  }, [])

  async function fetchScrapeUsage(uid: string) {
    const { data } = await supabase
      .from('scrape_usage')
      .select('count')
      .eq('user_id', uid)
      .eq('month', CURRENT_MONTH)
      .maybeSingle()
    setScrapeCount(data?.count ?? 0)
  }

  async function incrementScrapeUsage(uid: string, increment: number) {
    await supabase.from('scrape_usage').upsert(
      { user_id: uid, month: CURRENT_MONTH, count: scrapeCount + increment },
      { onConflict: 'user_id,month' }
    )
    setScrapeCount(c => c + increment)
  }

  // ── Generate ICP ────────────────────────────────────────────────────────
  async function handleGenerateIcp() {
    if (!industry && !location) return
    setGeneratingIcp(true)
    setError('')
    try {
      const res = await fetch('/api/generate-icp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ industry, location }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setIcp(data.icp)
    } catch {
      setError('Kunde inte kontakta Claude API. Kontrollera ANTHROPIC_API_KEY.')
    } finally {
      setGeneratingIcp(false)
    }
  }

  // ── Search ──────────────────────────────────────────────────────────────
  async function handleSearch() {
    if (!industry && !location) { setError('Fyll i minst Bransch eller Plats.'); return }
    setSearching(true)
    setError('')
    setMockWarning('')
    setResults([])
    setSearchDone(false)

    try {
      const res = await fetch('/api/search-leads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ industry, location, radius, maxResults, icp }),
      })
      const data = await res.json()

      if (!res.ok) { setError(data.error ?? 'Sökning misslyckades'); return }

      const found: LeadResult[] = data.results ?? []
      setResults(found)
      setSearchDone(true)
      if (data.mock) setMockWarning(data.message)

      // Increment scrape usage
      await incrementScrapeUsage(deviceId.current, found.length)

      // Persist the whole result set, not just the ones pushed to the CRM.
      // Mock results are skipped — they are demo filler, not real businesses.
      if (!data.mock) await persistSearch(found)
    } catch {
      setError('Nätverksfel. Kontrollera att servern körs.')
    } finally {
      setSearching(false)
    }
  }

  // ── Persist search + results ────────────────────────────────────────────
  // Deliberately non-fatal: a history write that fails must never cost the user
  // the results they just paid quota for, so it warns instead of throwing.
  async function persistSearch(found: LeadResult[]) {
    const { data: search, error: searchErr } = await supabase
      .from('lead_searches')
      .insert({
        industry: industry || null,
        location: location || null,
        country,
        radius,
        max_results: maxResults,
        icp: icp || null,
        result_count: found.length,
        user_id: deviceId.current,
      })
      .select('id')
      .single()

    if (searchErr || !search) {
      console.error('[Lead Finder] Kunde inte spara sökningen:', searchErr)
      setHistoryError('Sökningen kunde inte sparas i historiken (resultaten nedan är oförändrade).')
      return
    }

    setCurrentSearchId(search.id)

    if (found.length === 0) return

    const rows = found.map(r => ({
      search_id: search.id,
      business_name: r.name,
      address: r.address,
      phone: r.phone,
      website: r.website,
      rating: r.rating,
      review_count: r.total_ratings,
      ai_score: r.ai_score,
      place_id: r.place_id,
      ai_reason: r.ai_reason,
      maps_url: r.maps_url,
    }))

    const { error: rowsErr } = await supabase.from('lead_search_results').insert(rows)
    if (rowsErr) {
      console.error('[Lead Finder] Kunde inte spara resultaten:', rowsErr)
      setHistoryError('Sökningen sparades men resultaten kunde inte lagras.')
    }
  }

  // ── History ─────────────────────────────────────────────────────────────
  async function loadSearches() {
    setSearchesLoading(true)
    setHistoryError('')
    const { data, error: e } = await supabase
      .from('lead_searches')
      .select('id, industry, location, country, result_count, created_at')
      .order('created_at', { ascending: false })
      .limit(100)
    if (e) setHistoryError(`Kunde inte hämta historiken: ${e.message}`)
    setSearches((data ?? []) as SavedSearch[])
    setSearchesLoading(false)
  }

  // Reads straight from lead_search_results — no Google call, so reopening an
  // old search costs nothing against the monthly quota.
  async function openHistorySearch(search: SavedSearch) {
    setOpenSearch(search)
    setOpenLoading(true)
    setHistoryError('')
    const { data, error: e } = await supabase
      .from('lead_search_results')
      .select('*')
      .eq('search_id', search.id)
      .order('ai_score', { ascending: false, nullsFirst: false })
    if (e) setHistoryError(`Kunde inte hämta resultaten: ${e.message}`)
    setOpenResults((data ?? []) as SavedResult[])
    setOpenLoading(false)
  }

  function showHistory() {
    setView('history')
    setOpenSearch(null)
    setOpenResults([])
    loadSearches()
  }

  // ── Manual leads ────────────────────────────────────────────────────────
  // Stored in lead_search_results with source='manual' and no search_id, so a
  // hand-entered lead renders in the same card and reaches the CRM through the
  // same button as a Google Places result. No Claude call: scoring works on a
  // batch against an ICP description, and a single lead typed in by hand has
  // neither — the card shows "Ej poängsatt" rather than an invented number.
  async function saveManualLead() {
    setMError('')
    if (!mBusiness.trim()) { setMError('Företagsnamn krävs.'); return }

    setMSaving(true)
    const { data, error } = await supabase
      .from('lead_search_results')
      .insert({
        search_id: null,
        source: 'manual',
        business_name: mBusiness.trim(),
        address: mAddress.trim() || null,
        phone: mPhone.trim() || null,
        website: mWebsite.trim() || null,
        notes: mNote.trim() || null,
        ai_score: null,
      })
      .select()
      .single()
    setMSaving(false)

    if (error || !data) {
      setMError(
        error?.code === 'PGRST204'
          ? 'Kolumnerna saknas — kör migration 024_manual_leads.sql först.'
          : `Kunde inte spara: ${error?.message ?? 'okänt fel'}`
      )
      return
    }

    setManualLeads(prev => [data as SavedResult, ...prev])
    setMBusiness(''); setMAddress(''); setMPhone(''); setMWebsite(''); setMNote('')
    setShowManualForm(false)
    setView('manual')
  }

  async function loadManualLeads() {
    setManualLoading(true)
    setMError('')
    const { data, error: e } = await supabase
      .from('lead_search_results')
      .select('*')
      .eq('source', 'manual')
      .order('created_at', { ascending: false })
      .limit(200)
    if (e) {
      setMError(
        e.code === '42703' || e.message.includes('source')
          ? 'Kolumnen source saknas — kör migration 024_manual_leads.sql först.'
          : `Kunde inte hämta egna leads: ${e.message}`
      )
    }
    setManualLeads((data ?? []) as SavedResult[])
    setManualLoading(false)
  }

  function showManual() {
    setView('manual')
    loadManualLeads()
  }

  // ── Add to CRM ──────────────────────────────────────────────────────────
  /** savedResultId is set when adding from the history view, so that row gets flagged. */
  async function handleAddCrm(
    lead: LeadResult,
    savedResultId?: string,
    opts?: { manual?: boolean; note?: string | null }
  ): Promise<string | null> {
    const defaultListId = localStorage.getItem('loopr_default_list_id') || null
    if (!defaultListId) {
      return 'Skapa en CRM-lista först (gå till CRM → + Nytt CRM)'
    }

    const { error } = await supabase.from('leads').insert({
      list_id: defaultListId,
      name: lead.name,
      business: lead.name,
      phone: lead.phone,
      website: lead.website,
      source: opts?.manual ? 'lead_finder_manual' : 'lead_finder_google',
      ai_score: lead.ai_score,
      status: LEAD_STATUS.NEW,
      notes: [
        lead.address,
        opts?.note ? `Anteckning: ${opts.note}` : '',
        lead.ai_reason ? `AI-analys: ${lead.ai_reason}` : '',
      ].filter(Boolean).join('\n\n'),
    })

    if (error) {
      console.error('[Lead Finder] CRM insert failed:', error)
      return `Insert misslyckades: ${error.message}`
    }

    // Mark the saved row so the history view shows it as already in the CRM.
    // From history we have the row id; from a live search we match on the
    // search it belongs to plus the Google place id.
    if (savedResultId) {
      await supabase.from('lead_search_results').update({ added_to_crm: true }).eq('id', savedResultId)
      setOpenResults(prev => prev.map(r => r.id === savedResultId ? { ...r, added_to_crm: true } : r))
      setManualLeads(prev => prev.map(r => r.id === savedResultId ? { ...r, added_to_crm: true } : r))
    } else if (currentSearchId) {
      await supabase.from('lead_search_results')
        .update({ added_to_crm: true })
        .eq('search_id', currentSearchId)
        .eq('place_id', lead.place_id)
    }

    // Fire-and-forget activity log (non-critical)
    supabase.from('activity_log').insert({
      user_id: deviceId.current,
      description: `Lead tillagd från Lead Finder: ${lead.name}`,
      entity_type: 'lead',
    }).then(({ error: logErr }) => { if (logErr) console.error('[Lead Finder] Activity log failed:', logErr) })

    return null
  }

  const scrapeRemaining = SCRAPE_LIMIT - scrapeCount
  const scrapeWarning = scrapeCount >= SCRAPE_LIMIT * 0.9

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-8">

      {/* ── Header + usage ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest mb-1" style={{ color: 'var(--brick)' }}>SÄLJPIPELINE</p>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
            Lead Finder
          </h1>
        </div>

        {/* Monthly usage counter */}
        <Panel padding="px-4 py-3" className="shrink-0 text-right" enableTilt={false}>
          <p className="text-[10px] tracking-widest mb-1" style={{ color: scrapeWarning ? '#ef4444' : 'var(--slate)' }}>
            MÅNADSKVOT
          </p>
          <p className="text-xl font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: scrapeWarning ? '#ef4444' : 'var(--cream)' }}>
            {scrapeCount.toLocaleString('sv-SE')} / {SCRAPE_LIMIT.toLocaleString('sv-SE')}
          </p>
          <p className="text-xs" style={{ color: 'var(--slate)' }}>
            {scrapeRemaining.toLocaleString('sv-SE')} kvar denna månad
          </p>
        </Panel>
      </div>

      {/* ── Vy-växlare: ny sökning / historik ─────────────────────────────── */}
      <div className="flex gap-2">
        {([
          { id: 'search'  as const, label: '🔍 Ny sökning' },
          { id: 'history' as const, label: '🕘 Tidigare sökningar' },
          { id: 'manual'  as const, label: '✋ Egna leads' },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => {
              if (t.id === 'history') showHistory()
              else if (t.id === 'manual') showManual()
              else setView('search')
            }}
            className="text-sm font-semibold px-4 py-2 rounded-lg transition-all"
            style={{
              backgroundColor: view === t.id ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.04)',
              color: view === t.id ? 'var(--brick)' : 'var(--slate)',
              border: `1px solid ${view === t.id ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.08)'}`,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}

        <button
          onClick={() => { setShowManualForm(v => !v); setMError('') }}
          className="text-sm font-semibold px-4 py-2 rounded-lg transition-all ml-auto"
          style={{
            backgroundColor: showManualForm ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.04)',
            color: showManualForm ? 'var(--brick)' : 'var(--cream)',
            border: `1px solid ${showManualForm ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.12)'}`,
            cursor: 'pointer',
          }}
        >
          {showManualForm ? '✕ Stäng' : '+ Lägg till eget lead'}
        </button>
      </div>

      {/* ── Formulär för eget lead ────────────────────────────────────────── */}
      {showManualForm && (
        <Panel padding="p-5" enableTilt={false}>
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--cream)' }}>Lägg till eget lead</p>
          <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
            För företag du hittat på annat håll. Leadet hamnar under “Egna leads” och kan läggas
            till i CRM precis som ett sökresultat. Det poängsätts inte av AI:n — poängsättningen
            bygger på en hel sökning mot din ICP-beskrivning.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              { label: 'Företagsnamn *', value: mBusiness, set: setMBusiness, ph: 'Rörmokarna AB' },
              { label: 'Telefonnummer',  value: mPhone,    set: setMPhone,    ph: '+46 70 123 45 67' },
              { label: 'Adress',         value: mAddress,  set: setMAddress,  ph: 'Storgatan 1, Stockholm' },
              { label: 'Hemsida',        value: mWebsite,  set: setMWebsite,  ph: 'https://…' },
            ]).map(f => (
              <div key={f.label}>
                <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>{f.label}</label>
                <input
                  value={f.value}
                  onChange={e => { f.set(e.target.value); setMError('') }}
                  placeholder={f.ph}
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'var(--cream)', borderRadius: 8, padding: '8px 12px',
                    width: '100%', fontSize: 14, outline: 'none',
                  }}
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Anteckning</label>
              <textarea
                value={mNote}
                onChange={e => setMNote(e.target.value)}
                rows={2}
                placeholder="Var kom leadet ifrån? Något att komma ihåg inför samtalet?"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--cream)', borderRadius: 8, padding: '8px 12px',
                  width: '100%', fontSize: 14, outline: 'none', resize: 'vertical',
                }}
              />
            </div>
          </div>

          {mError && <p className="text-xs mt-3" style={{ color: '#ef4444' }}>⚠️ {mError}</p>}

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={saveManualLead}
              disabled={mSaving || !mBusiness.trim()}
              className="text-sm font-semibold px-4 py-2 rounded-lg transition-all"
              style={{
                backgroundColor: 'rgba(168,85,247,0.2)',
                color: 'var(--brick)',
                border: '1px solid rgba(168,85,247,0.35)',
                cursor: mSaving || !mBusiness.trim() ? 'default' : 'pointer',
                opacity: mSaving || !mBusiness.trim() ? 0.5 : 1,
              }}
            >
              {mSaving ? 'Sparar…' : 'Spara lead'}
            </button>
          </div>
        </Panel>
      )}

      {historyError && (
        <p className="text-xs px-1" style={{ color: '#fbbf24' }}>⚠️ {historyError}</p>
      )}

      {view === 'search' && (<>
      {/* ── Source toggle ─────────────────────────────────────────────────── */}
      <div className="flex gap-2">
        {(['google', 'indeed'] as const).map(s => (
          <button
            key={s}
            disabled={s === 'indeed'}
            onClick={() => s !== 'indeed' && setSource(s)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              backgroundColor: source === s ? 'rgba(168,85,247,0.25)' : 'rgba(255,255,255,0.04)',
              color: s === 'indeed' ? 'var(--slate)' : source === s ? 'var(--brick)' : 'var(--slate)',
              border: `1px solid ${source === s ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)'}`,
              cursor: s === 'indeed' ? 'not-allowed' : 'pointer',
              opacity: s === 'indeed' ? 0.45 : 1,
            }}
          >
            {s === 'google' ? '🗺️ Google Maps' : '💼 Indeed Jobs'}
            {s === 'indeed' && (
              <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                Snart
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Search form ───────────────────────────────────────────────────── */}
      <Panel padding="p-6" className="space-y-5" enableTilt={false}>
        <p className="font-semibold text-sm tracking-wider uppercase" style={{ color: 'var(--brick)' }}>
          Definiera din sökning
        </p>

        {/* ICP */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--slate)' }}>
              Idealisk Kundprofil (ICP)
            </label>
            <button
              onClick={handleGenerateIcp}
              disabled={generatingIcp || (!industry && !location)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
              style={{
                backgroundColor: 'rgba(201,162,75,0.15)',
                color: 'var(--gold)',
                border: '1px solid rgba(201,162,75,0.3)',
              }}
            >
              {generatingIcp ? (
                <><span className="animate-spin inline-block">⟳</span> Genererar…</>
              ) : (
                <>✨ Generera med AI</>
              )}
            </button>
          </div>
          <textarea
            value={icp}
            onChange={e => setIcp(e.target.value)}
            placeholder="Beskriv din idealkund — bransch, storlek, smärtpunkter, budget… Eller tryck 'Generera med AI' efter att du fyllt i Bransch + Plats."
            rows={5}
            className="w-full rounded-lg px-3 py-2 text-sm resize-none outline-none transition-colors"
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--cream)',
            }}
            onFocus={e => { e.target.style.borderColor = 'rgba(168,85,247,0.5)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
          />
        </div>

        {/* Grid of fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Country */}
          <div>
            <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>
              Målland
            </label>
            <Dropdown
              value={country}
              onChange={setCountry}
              className="w-full"
              options={[
                { value: 'sverige', label: '🇸🇪 Sverige' },
                { value: 'other', label: '🌍 Övriga länder' },
              ]}
            />
          </div>

          {/* Location */}
          <div>
            <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>
              Plats
            </label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="t.ex. Stockholm, Göteborg…"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
              style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--cream)',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(168,85,247,0.5)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
            />
          </div>

          {/* Industry */}
          <div>
            <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>
              Bransch
            </label>
            <input
              type="text"
              value={industry}
              onChange={e => setIndustry(e.target.value)}
              placeholder="t.ex. rörmokare, tandläkare…"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
              style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--cream)',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(168,85,247,0.5)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
            />
          </div>

          {/* Radius */}
          <div>
            <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>
              Radie
            </label>
            <Dropdown
              value={String(radius)}
              onChange={v => setRadius(Number(v))}
              className="w-full"
              options={RADIUS_OPTIONS.map(r => ({ value: String(r), label: `${r} km` }))}
            />
          </div>

          {/* Max Results */}
          <div>
            <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>
              Max Resultat
            </label>
            <Dropdown
              value={String(maxResults)}
              onChange={v => setMaxResults(Number(v))}
              className="w-full"
              options={MAX_RESULTS_OPTIONS.map(n => ({ value: String(n), label: `${n} resultat` }))}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
            ⚠️ {error}
          </p>
        )}

        {/* Search button */}
        <button
          onClick={handleSearch}
          disabled={searching || scrapeCount >= SCRAPE_LIMIT}
          className="w-full py-3 rounded-lg font-semibold text-sm transition-all disabled:opacity-50"
          style={{
            backgroundColor: 'var(--brick)',
            color: 'var(--cream)',
            fontFamily: 'Arial, Helvetica, sans-serif',
          }}
        >
          {searching ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin inline-block">⟳</span>
              Söker & poängsätter med AI…
            </span>
          ) : scrapeCount >= SCRAPE_LIMIT ? (
            'Månadskvot slut — kontakta support'
          ) : (
            '🔍 Sök & Poängsätt Företag'
          )}
        </button>
      </Panel>

      {/* ── Mock warning ──────────────────────────────────────────────────── */}
      {mockWarning && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm" style={{ backgroundColor: 'rgba(201,162,75,0.1)', border: '1px solid rgba(201,162,75,0.25)', color: 'var(--gold)' }}>
          <span>ℹ️</span>
          <span>{mockWarning}</span>
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {searching && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Panel key={i} padding="p-4" className="h-40 animate-pulse" magic={false} />
          ))}
        </div>
      )}

      {searchDone && !searching && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="font-semibold" style={{ color: 'var(--cream)' }}>
              {results.length} företag hittade — sorterade efter AI-poäng
            </p>
            <p className="text-xs" style={{ color: 'var(--slate)' }}>
              {results.filter(r => r.ai_score >= 70).length} starka matcher (70+)
            </p>
          </div>

          {results.length === 0 ? (
            <Panel padding="p-8" className="text-center" enableTilt={false}>
              <p className="text-lg" style={{ color: 'var(--slate)' }}>Inga resultat hittades</p>
              <p className="text-sm mt-2" style={{ color: 'var(--slate)', opacity: 0.6 }}>
                Prova en bredare sökning eller annat sökord.
              </p>
            </Panel>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {results.map(lead => (
                <LeadCard key={lead.place_id} lead={lead} onAddCrm={handleAddCrm} />
              ))}
            </div>
          )}
        </div>
      )}

      </>)}

      {/* ── Egna leads ────────────────────────────────────────────────────── */}
      {view === 'manual' && (
        <div className="space-y-4">
          <Panel padding="p-4" enableTilt={false}>
            <p className="text-sm font-semibold" style={{ color: 'var(--cream)' }}>Egna leads</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>
              Leads du lagt till för hand. De fungerar som sökresultat — lägg dem i CRM så dyker
              de upp i Cold Call och pipelinen.
            </p>
          </Panel>

          {manualLoading ? (
            <p className="text-sm px-1" style={{ color: 'var(--slate)' }}>Laddar…</p>
          ) : manualLeads.length === 0 ? (
            <p className="text-sm px-1" style={{ color: 'var(--slate)' }}>
              Inga egna leads än — använd &ldquo;+ Lägg till eget lead&rdquo; ovan.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {manualLeads.map(r => (
                <LeadCard
                  key={r.id}
                  lead={toLeadResult(r)}
                  initiallyAdded={r.added_to_crm}
                  unscored={r.ai_score == null}
                  isManual
                  note={r.notes}
                  onAddCrm={(l) => handleAddCrm(l, r.id, { manual: true, note: r.notes })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tidigare sökningar ────────────────────────────────────────────── */}
      {view === 'history' && !openSearch && (
        <Panel padding="p-5" enableTilt={false}>
          <h2 className="font-semibold mb-1" style={{ color: 'var(--cream)' }}>Tidigare sökningar</h2>
          <p className="text-xs mb-4" style={{ color: 'var(--slate)' }}>
            Öppna en sökning för att se alla resultat igen. Det kostar inget av månadskvoten.
          </p>

          {searchesLoading ? (
            <p className="text-sm" style={{ color: 'var(--slate)' }}>Laddar…</p>
          ) : searches.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--slate)' }}>
              Inga sparade sökningar ännu. Kör en sökning så hamnar den här automatiskt.
            </p>
          ) : (
            <ul className="space-y-2">
              {searches.map(sr => (
                <li key={sr.id}>
                  <button
                    onClick={() => openHistorySearch(sr)}
                    className="w-full text-left px-4 py-3 rounded-lg transition-colors flex items-center justify-between gap-4"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      cursor: 'pointer',
                    }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--cream)' }}>
                        {[sr.industry, sr.location].filter(Boolean).join(' · ') || 'Sökning utan filter'}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--slate)' }}>
                        {formatSearchDate(sr.created_at)}
                      </p>
                    </div>
                    <span
                      className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: 'var(--brick)' }}
                    >
                      {sr.result_count} träffar
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {/* ── En öppnad historik-sökning ────────────────────────────────────── */}
      {view === 'history' && openSearch && (
        <div className="space-y-4">
          <Panel padding="p-4" enableTilt={false}>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <button
                  onClick={() => { setOpenSearch(null); setOpenResults([]) }}
                  className="text-xs mb-1"
                  style={{ color: 'var(--brick)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                >
                  ← Alla sökningar
                </button>
                <p className="text-sm font-semibold truncate" style={{ color: 'var(--cream)' }}>
                  {[openSearch.industry, openSearch.location].filter(Boolean).join(' · ') || 'Sökning utan filter'}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--slate)' }}>
                  {formatSearchDate(openSearch.created_at)} · {openSearch.result_count} träffar · sparad kopia, ingen ny sökning
                </p>
              </div>
            </div>
          </Panel>

          {openLoading ? (
            <p className="text-sm px-1" style={{ color: 'var(--slate)' }}>Laddar resultat…</p>
          ) : openResults.length === 0 ? (
            <p className="text-sm px-1" style={{ color: 'var(--slate)' }}>Inga sparade resultat för den här sökningen.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {openResults.map(r => (
                <LeadCard
                  key={r.id}
                  lead={toLeadResult(r)}
                  initiallyAdded={r.added_to_crm}
                  unscored={r.ai_score == null}
                  onAddCrm={(l) => handleAddCrm(l, r.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
