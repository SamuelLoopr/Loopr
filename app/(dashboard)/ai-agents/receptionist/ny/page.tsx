'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Panel from '@/app/components/Panel'
import Dropdown from '@/app/components/Dropdown'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Lead {
  id: string
  name: string | null
  business: string | null
  phone: string | null
  email: string | null
  website: string | null
}

interface ElevenLabsVoice {
  voiceId: string
  name: string
  language: string | null
  accent: string | null
}

const STEP_LABELS = ['Välj Lead', 'Webbplats & Prompt', 'Voice & Deploy']

// ─── Wizard ───────────────────────────────────────────────────────────────────
export default function NewReceptionistPage() {
  const router = useRouter()

  // Step tracking
  const [step, setStep] = useState(1)

  // Step 1 — lead selection
  const [leads, setLeads] = useState<Lead[]>([])
  const [leadSearch, setLeadSearch] = useState('')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  // Step 2 — URL + prompt generation
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  const [promptError, setPromptError] = useState('')
  const [generatedPrompt, setGeneratedPrompt] = useState('')

  // Step 3 — voice & deploy
  const [agentName, setAgentName] = useState('')
  const [language, setLanguage] = useState('sv')
  const [intelligenceTier, setIntelligenceTier] = useState('standard')
  const [voiceId, setVoiceId] = useState('')
  const [elevenLabsVoices, setElevenLabsVoices] = useState<ElevenLabsVoice[]>([])
  const [voicesLoading, setVoicesLoading] = useState(true)
  const [voicesError, setVoicesError] = useState('')
  const [promptText, setPromptText] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [transferNumber, setTransferNumber] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // ── Fetch leads ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('leads')
      .select('id,name,business,phone,email,website')
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => setLeads((data ?? []) as Lead[]))
  }, [])

  // ── Fetch real ElevenLabs voices — the old picker saved fake ids like
  // "freya" that ElevenLabs silently ignores, so every agent sounded like
  // whatever default voice is on the shared ELEVENLABS_AGENT_ID. ────────────
  useEffect(() => {
    setVoicesLoading(true)
    fetch('/api/elevenlabs/voices')
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { setVoicesError(data.error || 'Okänt fel'); return }
        const voices: ElevenLabsVoice[] = data.voices ?? []
        setElevenLabsVoices(voices)
        // Default to a Swedish-tagged voice when one exists — Loopr's
        // customers are Swedish businesses, so this should never silently
        // land on an English-trained voice by picking whichever came first.
        const firstSwedish = voices.find(v => v.language === 'sv')
        if (firstSwedish) setVoiceId(firstSwedish.voiceId)
        else if (voices.length) setVoiceId(voices[0].voiceId)
      })
      .catch(err => setVoicesError(err instanceof Error ? err.message : String(err)))
      .finally(() => setVoicesLoading(false))
  }, [])

  // ── Pre-fill step 2 from lead ────────────────────────────────────────────
  useEffect(() => {
    if (selectedLead) {
      setWebsiteUrl(selectedLead.website ?? '')
      setBusinessName(selectedLead.business ?? selectedLead.name ?? '')
    }
  }, [selectedLead])

  // ── Pre-fill step 3 from step 2 ──────────────────────────────────────────
  useEffect(() => {
    if (step === 3) {
      setPromptText(generatedPrompt)
      if (!agentName) setAgentName(businessName ? `${businessName} Receptionist` : 'Min Receptionist')
      if (!welcomeMessage) setWelcomeMessage(`Hej! Du har nått ${businessName || 'oss'}. Hur kan jag hjälpa dig?`)
    }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Generate prompt ──────────────────────────────────────────────────────
  async function handleGeneratePrompt() {
    setGeneratingPrompt(true)
    setPromptError('')
    try {
      const res = await fetch('/api/generate-agent-prompt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: websiteUrl, businessName, language }),
      })
      const data = await res.json()
      if (data.error) { setPromptError(data.error); return }
      setGeneratedPrompt(data.prompt)
    } catch {
      setPromptError('Kunde inte kontakta API. Kontrollera ANTHROPIC_API_KEY.')
    } finally {
      setGeneratingPrompt(false)
    }
  }

  // ── Save agent ───────────────────────────────────────────────────────────
  async function saveAgent(status: 'draft' | 'deployed') {
    if (!agentName.trim()) { setSaveError('Ange ett agentnamn.'); return }
    setSaving(true)
    setSaveError('')

    const { data, error } = await supabase
      .from('agents')
      .insert({
        name: agentName,
        lead_id: selectedLead?.id ?? null,
        business_name: businessName || null,
        language,
        intelligence_tier: intelligenceTier,
        voice_id: voiceId,
        prompt_text: promptText || null,
        welcome_message: welcomeMessage || null,
        transfer_number: transferNumber || null,
        status,
      })
      .select('id')
      .single()

    if (error || !data) {
      setSaveError(`Kunde inte spara: ${error?.message ?? 'okänt fel'}`)
      setSaving(false)
      return
    }

    router.push(`/ai-agents/receptionist/${data.id}`)
  }

  // ── Filtered leads ───────────────────────────────────────────────────────
  const filteredLeads = leads.filter(l => {
    if (!leadSearch) return true
    const q = leadSearch.toLowerCase()
    return l.name?.toLowerCase().includes(q) || l.business?.toLowerCase().includes(q)
  })

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl space-y-6 pb-12">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--slate)' }}>
        <Link href="/ai-agents" className="hover:underline">AI Agenter</Link>
        <span>›</span>
        <Link href="/ai-agents/receptionist" className="hover:underline">Receptionister</Link>
        <span>›</span>
        <span style={{ color: 'var(--cream)' }}>Ny Agent</span>
      </div>

      {/* Header */}
      <div>
        <p className="text-xs tracking-widest mb-1" style={{ color: 'var(--brick)' }}>NY AGENT</p>
        <h1 className="text-3xl font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
          Bygg AI-Receptionist
        </h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1
          const active = step === n
          const done = step > n
          return (
            <div key={n} className="flex items-center">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{
                    backgroundColor: done ? '#4ade8020' : active ? 'var(--brick)' : 'rgba(255,255,255,0.08)',
                    color: done ? '#4ade80' : active ? 'white' : 'var(--slate)',
                    border: done ? '1px solid #4ade8040' : active ? 'none' : '1px solid rgba(255,255,255,0.12)',
                    boxShadow: active ? '0 0 0 4px rgba(168,85,247,0.15)' : 'none',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {done ? '✓' : n}
                </div>
                <span className="text-xs font-semibold hidden sm:block"
                  style={{
                    color: active ? 'var(--cream)' : done ? '#4ade80' : 'var(--slate)',
                    transition: 'color 0.3s ease',
                  }}>
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                // Connector fills in once the step it leads out of is done,
                // so the bar reads as actual progress rather than decoration.
                <div className="w-8 h-px mx-2 overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
                  <div
                    className="h-full"
                    style={{
                      width: done ? '100%' : '0%',
                      backgroundColor: '#4ade80',
                      transition: 'width 0.45s ease',
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Step 1: Lead Selection ──────────────────────────────────────── */}
      {step === 1 && (
        <Panel padding="p-6" className="space-y-4 loopr-step-in" enableTilt={false}>
          <div>
            <h2 className="font-semibold text-base mb-1" style={{ color: 'var(--cream)' }}>Välj ett lead att koppla agenten till</h2>
            <p className="text-xs" style={{ color: 'var(--slate)' }}>Valfritt — du kan hoppa över och fylla i manuellt.</p>
          </div>

          <input
            type="text"
            value={leadSearch}
            onChange={e => setLeadSearch(e.target.value)}
            placeholder="Sök på namn eller företag…"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--cream)' }}
            onFocus={e => { e.target.style.borderColor = 'rgba(168,85,247,0.5)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
          />

          <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
            {filteredLeads.length === 0 ? (
              <p className="text-xs py-4 text-center" style={{ color: 'var(--slate)' }}>
                {leads.length === 0 ? 'Inga leads i CRM ännu.' : 'Inga leads matchar sökningen.'}
              </p>
            ) : (
              filteredLeads.map(lead => (
                <button
                  key={lead.id}
                  onClick={() => setSelectedLead(prev => prev?.id === lead.id ? null : lead)}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all"
                  style={{
                    backgroundColor: selectedLead?.id === lead.id ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${selectedLead?.id === lead.id ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    color: 'var(--cream)',
                  }}
                >
                  <span className="font-medium">{lead.name ?? '—'}</span>
                  {lead.business && <span className="ml-2 text-xs" style={{ color: 'var(--slate)' }}>{lead.business}</span>}
                  {lead.phone && <span className="ml-2 text-xs" style={{ color: 'var(--slate)' }}>· {lead.phone}</span>}
                </button>
              ))
            )}
          </div>

          {selectedLead && (
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
              style={{ backgroundColor: 'rgba(168,85,247,0.1)', color: 'var(--brick)', border: '1px solid rgba(168,85,247,0.2)' }}>
              ✓ Valt: <strong>{selectedLead.business ?? selectedLead.name}</strong>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => { setSelectedLead(null); setStep(2) }}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{ color: 'var(--slate)', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              Hoppa över →
            </button>
            <button
              onClick={() => setStep(2)}
              disabled={leads.length > 0 && !selectedLead && leadSearch !== ''}
              className="px-5 py-2 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: 'var(--brick)', color: 'var(--cream)' }}
            >
              Nästa →
            </button>
          </div>
        </Panel>
      )}

      {/* ── Step 2: URL + Prompt ────────────────────────────────────────── */}
      {step === 2 && (
        <Panel padding="p-6" className="space-y-5 loopr-step-in" enableTilt={false}>
          <div>
            <h2 className="font-semibold text-base mb-1" style={{ color: 'var(--cream)' }}>Webbplats & AI-prompt</h2>
            <p className="text-xs" style={{ color: 'var(--slate)' }}>
              Vi hämtar info från webbplatsen och Claude genererar en färdig receptionist-prompt.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>
                Företagsnamn
              </label>
              <input
                type="text"
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
                placeholder="t.ex. Rörmokarna AB"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--cream)' }}
                onFocus={e => { e.target.style.borderColor = 'rgba(168,85,247,0.5)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
              />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>
                Webbplats-URL
              </label>
              <input
                type="text"
                value={websiteUrl}
                onChange={e => setWebsiteUrl(e.target.value)}
                placeholder="rormakarnaab.se"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--cream)' }}
                onFocus={e => { e.target.style.borderColor = 'rgba(168,85,247,0.5)' }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div />
            <button
              onClick={handleGeneratePrompt}
              disabled={generatingPrompt || (!businessName && !websiteUrl)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
              style={{ backgroundColor: 'rgba(201,162,75,0.15)', color: 'var(--gold)', border: '1px solid rgba(201,162,75,0.3)' }}
            >
              {generatingPrompt
                ? <><span className="animate-spin">⟳</span> Genererar…</>
                : '✨ Skapa Prompt med AI'}
            </button>
          </div>

          {promptError && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
              ⚠️ {promptError}
            </p>
          )}

          {generatedPrompt && (
            <div className="space-y-2">
              <p className="text-xs font-semibold" style={{ color: '#4ade80' }}>✓ Prompt genererad — du kan redigera den i nästa steg</p>
              <div className="rounded-lg p-3 text-xs font-mono max-h-40 overflow-y-auto"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--slate)' }}>
                {generatedPrompt.slice(0, 600)}{generatedPrompt.length > 600 ? '…' : ''}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setStep(1)}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{ color: 'var(--slate)', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              ← Tillbaka
            </button>
            <button
              onClick={() => setStep(3)}
              className="px-5 py-2 rounded-lg text-sm font-semibold"
              style={{ backgroundColor: 'var(--brick)', color: 'var(--cream)' }}
            >
              Nästa →
            </button>
          </div>
        </Panel>
      )}

      {/* ── Step 3: Voice & Deploy ──────────────────────────────────────── */}
      {step === 3 && (
        <Panel padding="p-6" className="space-y-5 loopr-step-in" enableTilt={false}>
          <div>
            <h2 className="font-semibold text-base mb-1" style={{ color: 'var(--cream)' }}>Voice & Deploy</h2>
            <p className="text-xs" style={{ color: 'var(--slate)' }}>Konfigurera röst, språk och driftsätt agenten.</p>
          </div>

          {/* Agent Name */}
          <div>
            <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>
              Agentnamn
            </label>
            <input
              type="text"
              value={agentName}
              onChange={e => setAgentName(e.target.value)}
              placeholder="t.ex. Rörmokarna AB Receptionist"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--cream)' }}
              onFocus={e => { e.target.style.borderColor = 'rgba(168,85,247,0.5)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
            />
          </div>

          {/* Language + Intelligence */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>
                Språk
              </label>
              <Dropdown
                value={language}
                onChange={v => {
                  setLanguage(v)
                  // Re-pick a real voice matching the new language instead of
                  // falling back to a fake label like "freya"/"rachel" — the
                  // exact bug this whole picker was rebuilt to eliminate.
                  const match = elevenLabsVoices.find(ev => ev.language === v)
                  if (match) setVoiceId(match.voiceId)
                }}
                className="w-full"
                options={[
                  { value: 'sv', label: '🇸🇪 Svenska' },
                  { value: 'en', label: '🇬🇧 Engelska' },
                ]}
              />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>
                Intelligensnivå
              </label>
              <div className="flex gap-1">
                {[{ value: 'standard', label: 'Standard' }, { value: 'turbo', label: 'Turbo ⚡' }].map(t => (
                  <button
                    key={t.value}
                    onClick={() => setIntelligenceTier(t.value)}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      backgroundColor: intelligenceTier === t.value ? 'rgba(168,85,247,0.25)' : 'rgba(255,255,255,0.04)',
                      color: intelligenceTier === t.value ? 'var(--brick)' : 'var(--slate)',
                      border: `1px solid ${intelligenceTier === t.value ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Voice selection */}
          <div>
            <label className="text-xs font-semibold tracking-wide uppercase block mb-2" style={{ color: 'var(--slate)' }}>
              Röst
            </label>
            {voicesLoading ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--slate)' }}>
                <span className="animate-spin">⟳</span> Hämtar röster från ElevenLabs…
              </div>
            ) : voicesError ? (
              <p className="text-sm" style={{ color: '#ef4444' }}>⚠️ Kunde inte hämta röster: {voicesError}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[...elevenLabsVoices]
                  .sort((a, b) => (b.language === 'sv' ? 1 : 0) - (a.language === 'sv' ? 1 : 0))
                  .map(v => (
                  <button
                    key={v.voiceId}
                    onClick={() => setVoiceId(v.voiceId)}
                    className="px-3 py-2.5 rounded-lg text-left transition-all"
                    style={{
                      backgroundColor: voiceId === v.voiceId ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${voiceId === v.voiceId ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    <p className="text-xs font-semibold" style={{ color: voiceId === v.voiceId ? 'var(--brick)' : 'var(--cream)' }}>
                      {v.language === 'sv' ? '🇸🇪 ' : ''}{v.name.split(' - ')[0]}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--slate)' }}>{v.accent ?? v.name.split(' - ')[1] ?? ''}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Transfer number */}
          <div>
            <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>
              Vidarekoppling-nummer
            </label>
            <input
              type="tel"
              value={transferNumber}
              onChange={e => setTransferNumber(e.target.value)}
              placeholder="t.ex. 070-123 45 67"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--cream)' }}
              onFocus={e => { e.target.style.borderColor = 'rgba(168,85,247,0.5)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
            />
          </div>

          {/* Welcome message */}
          <div>
            <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>
              Välkomsthälsning
            </label>
            <input
              type="text"
              value={welcomeMessage}
              onChange={e => setWelcomeMessage(e.target.value)}
              placeholder="Hej! Du har nått oss. Hur kan jag hjälpa dig?"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--cream)' }}
              onFocus={e => { e.target.style.borderColor = 'rgba(168,85,247,0.5)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
            />
          </div>

          {/* Prompt editor */}
          <div>
            <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>
              Agent Prompt <span className="opacity-50 normal-case font-normal">(redigerbar)</span>
            </label>
            <textarea
              value={promptText}
              onChange={e => setPromptText(e.target.value)}
              rows={12}
              placeholder="Prompten genereras i steg 2, eller skriv din egen här…"
              className="w-full rounded-lg px-3 py-2 text-xs font-mono resize-y outline-none transition-colors"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--cream)' }}
              onFocus={e => { e.target.style.borderColor = 'rgba(168,85,247,0.5)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
            />
          </div>

          {saveError && (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
              ⚠️ {saveError}
            </p>
          )}

          <div className="flex items-center justify-between pt-2 gap-3">
            <button onClick={() => setStep(2)}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{ color: 'var(--slate)', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              ← Tillbaka
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => saveAgent('draft')}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
                style={{ backgroundColor: 'rgba(255,255,255,0.07)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.12)' }}
              >
                {saving ? '⟳ Sparar…' : 'Spara Utkast'}
              </button>
              <button
                onClick={() => saveAgent('deployed')}
                disabled={saving}
                className="px-5 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
                style={{ backgroundColor: 'var(--brick)', color: 'var(--cream)' }}
              >
                {saving ? '⟳ Driftsätter…' : '🚀 Driftsätt Receptionist'}
              </button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  )
}
