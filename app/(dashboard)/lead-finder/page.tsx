'use client'

import { useState, useEffect, useRef } from 'react'
import Panel from '../../components/Panel'
import Dropdown from '../../components/Dropdown'
import { supabase } from '@/lib/supabase'
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
function LeadCard({ lead, onAddCrm }: { lead: LeadResult; onAddCrm: (l: LeadResult) => Promise<string | null> }) {
  const [added, setAdded] = useState(false)
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
        </div>
        {/* AI Score badge */}
        <div className="shrink-0 flex flex-col items-center">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold"
            style={{ border: `2px solid ${scoreColor(lead.ai_score)}`, color: scoreColor(lead.ai_score) }}
          >
            {lead.ai_score}
          </div>
          <span className="text-[9px] mt-0.5" style={{ color: scoreColor(lead.ai_score) }}>
            {scoreLabel(lead.ai_score)}
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

      setResults(data.results ?? [])
      setSearchDone(true)
      if (data.mock) setMockWarning(data.message)

      // Increment scrape usage
      await incrementScrapeUsage(deviceId.current, data.results?.length ?? 0)
    } catch {
      setError('Nätverksfel. Kontrollera att servern körs.')
    } finally {
      setSearching(false)
    }
  }

  // ── Add to CRM ──────────────────────────────────────────────────────────
  async function handleAddCrm(lead: LeadResult): Promise<string | null> {
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
      source: 'lead_finder_google',
      ai_score: lead.ai_score,
      status: 'new',
      notes: lead.address + (lead.ai_reason ? `\n\nAI-analys: ${lead.ai_reason}` : ''),
    })

    if (error) {
      console.error('[Lead Finder] CRM insert failed:', error)
      return `Insert misslyckades: ${error.message}`
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

    </div>
  )
}
