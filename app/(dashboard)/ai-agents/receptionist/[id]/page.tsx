'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Panel from '@/app/components/Panel'
import Dropdown from '@/app/components/Dropdown'
import DemosTab from '@/app/components/DemosTab'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Agent {
  id: string
  lead_id: string | null
  name: string
  business_name: string | null
  language: string | null
  intelligence_tier: string | null
  voice_id: string | null
  prompt_text: string | null
  welcome_message: string | null
  transfer_number: string | null
  status: string | null
  industry: string | null
  description: string | null
  target_customers: string | null
  services: string | null
  pain_points: string | null
  goals: string | null
  cal_com_event_type_id: string | null
  airtable_table_name: string | null
  webhook_token: string | null
  public_share_id: string | null
  created_at: string
}

interface PhoneNumber {
  id: string
  phone_number: string
  twilio_sid: string
  friendly_name: string | null
  created_at: string
}

interface CallLog {
  id: string
  transcript: string | null
  summary: string | null
  sentiment: string | null
  duration_sec: number | null
  cost: number | null
  from_number: string | null
  to_number: string | null
  status: string | null
  error_message: string | null
  created_at: string
}

interface ElevenLabsVoice {
  voiceId: string
  name: string
  language: string | null
  accent: string | null
}

interface SharedSwedishVoice {
  voiceId: string
  publicOwnerId: string
  name: string
  gender: string | null
  accent: string | null
  previewUrl: string | null
}

// A real ElevenLabs voice ID is a 20-char alphanumeric string, e.g.
// "21m00Tcm4TlvDq8ikWAM" — never a display label like "maja". Used to warn
// when an agent still has a pre-fix placeholder value stored.
function looksLikeElevenLabsVoiceId(v: string): boolean {
  return /^[a-zA-Z0-9]{18,24}$/.test(v)
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'prompt',   label: 'Prompt' },
  { id: 'business', label: 'Business' },
  { id: 'settings', label: 'Inställningar' },
  { id: 'calendar', label: 'Kalender' },
  { id: 'phone',    label: 'Telefon' },
  { id: 'proposal', label: 'Förslag' },
  { id: 'demos',    label: 'Demos' },
  { id: 'test',     label: 'Test' },
  { id: 'aifix',    label: 'AI Fix' },
  { id: 'billing',  label: 'Fakturering' },
  { id: 'calls',    label: 'Samtal' },
]

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

function FieldInput({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
        onFocus={e => { e.target.style.borderColor = 'rgba(168,85,247,0.5)' }}
        onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
      />
    </div>
  )
}

function FieldTextarea({ label, value, onChange, placeholder, rows = 4, mono = false }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; mono?: boolean
}) {
  return (
    <div>
      <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>
        {label}
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-y outline-none transition-colors"
        style={{
          ...inputStyle,
          padding: '8px 12px',
          fontFamily: mono ? 'monospace' : undefined,
          fontSize: mono ? '12px' : '14px',
        }}
        onFocus={e => { e.target.style.borderColor = 'rgba(168,85,247,0.5)' }}
        onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
      />
    </div>
  )
}

// ─── Agent Detail Page ────────────────────────────────────────────────────────
export default function AgentDetailPage() {
  const params = useParams()
  const id = params?.id as string

  const [agent, setAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('prompt')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Prompt tab state
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [transferNumber, setTransferNumber] = useState('')
  const [promptText, setPromptText] = useState('')

  // Business tab state
  const [businessName, setBusinessName] = useState('')
  const [industry, setIndustry] = useState('')
  const [description, setDescription] = useState('')
  const [targetCustomers, setTargetCustomers] = useState('')
  const [services, setServices] = useState('')
  const [painPoints, setPainPoints] = useState('')
  const [goals, setGoals] = useState('')

  // Settings tab state
  const [settingsLanguage, setSettingsLanguage] = useState('sv')
  const [settingsTier, setSettingsTier] = useState('standard')
  const [settingsVoiceId, setSettingsVoiceId] = useState('')
  const [elevenLabsVoices, setElevenLabsVoices] = useState<ElevenLabsVoice[]>([])
  const [voicesLoading, setVoicesLoading] = useState(false)
  const [voicesError, setVoicesError] = useState('')
  const [swedishLibraryVoices, setSwedishLibraryVoices] = useState<SharedSwedishVoice[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryError, setLibraryError] = useState('')
  const [importingVoiceId, setImportingVoiceId] = useState('')
  const [importError, setImportError] = useState('')
  const [showMoreSwedishVoices, setShowMoreSwedishVoices] = useState(false)

  // Calendar tab state
  const [calEventTypeId, setCalEventTypeId] = useState('')
  const [calTesting, setCalTesting] = useState(false)
  const [calResult, setCalResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Phone tab state
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([])
  const [phoneLoading, setPhoneLoading] = useState(false)
  const [areaCode, setAreaCode] = useState('')
  const [searchResults, setSearchResults] = useState<{ phoneNumber: string; friendlyName: string; locality: string | null }[]>([])
  const [searching, setSearching] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const [purchasingNumber, setPurchasingNumber] = useState('')

  // Proposal tab state
  const [propTitle, setPropTitle] = useState('')
  const [propTagline, setPropTagline] = useState('')
  const [propValue, setPropValue] = useState('')
  const [propCreating, setPropCreating] = useState(false)
  const [propError, setPropError] = useState('')
  const [propShareId, setPropShareId] = useState('')

  // AI Fix tab state
  const [fixProblem, setFixProblem] = useState('')
  const [fixDiagnosing, setFixDiagnosing] = useState(false)
  const [fixError, setFixError] = useState('')
  const [fixResult, setFixResult] = useState<{ diagnosis: string; suggestedField: string; currentValue: string; suggestedValue: string } | null>(null)
  const [fixApplying, setFixApplying] = useState(false)
  const [fixApplied, setFixApplied] = useState(false)

  // Billing tab state
  const [billingStats, setBillingStats] = useState<{ calls: number; minutes: number; cost: number } | null>(null)

  // Calls tab state
  const [callLogs, setCallLogs] = useState<CallLog[]>([])
  const [callLogsLoading, setCallLogsLoading] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')

  // Public "prova agenten live" demo link (app/prova/[shareId])
  const [publicDemoUrl, setPublicDemoUrl] = useState('')
  const [generatingDemoLink, setGeneratingDemoLink] = useState(false)
  const [demoLinkError, setDemoLinkError] = useState('')
  const [demoLinkCopied, setDemoLinkCopied] = useState(false)
  const [generatingWebhook, setGeneratingWebhook] = useState(false)
  const [airtableTableName, setAirtableTableName] = useState('')
  const [syncingAirtable, setSyncingAirtable] = useState(false)
  const [airtableResult, setAirtableResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Test tab — live call state
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'connected'>('idle')
  const [callMode, setCallMode] = useState<'listening' | 'speaking'>('listening')
  const [callError, setCallError] = useState('')
  const [voiceAppliedWarning, setVoiceAppliedWarning] = useState('')
  const [transcript, setTranscript] = useState<{ text: string; source: 'user' | 'ai' }[]>([])
  const convRef = useRef<{ endSession: () => Promise<void> } | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  // ── ?tab= deep link (used by the "Testa"-button in the agent list) ──────
  // Runs as an effect rather than a useState initializer: during a client-side
  // navigation React renders the new page before the URL has switched over, so
  // reading window.location during that first render still returns the old
  // page's query string.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab')
    if (requested && TABS.some(t => t.id === requested)) setActiveTab(requested)
  }, [])

  // ── Fetch agent ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return
    supabase
      .from('agents')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        const a = data as Agent
        setAgent(a)
        // Prompt tab
        setWelcomeMessage(a.welcome_message ?? '')
        setTransferNumber(a.transfer_number ?? '')
        setPromptText(a.prompt_text ?? '')
        // Business tab
        setBusinessName(a.business_name ?? '')
        setIndustry(a.industry ?? '')
        setDescription(a.description ?? '')
        setTargetCustomers(a.target_customers ?? '')
        setServices(a.services ?? '')
        setPainPoints(a.pain_points ?? '')
        setGoals(a.goals ?? '')
        // Settings tab
        setSettingsLanguage(a.language ?? 'sv')
        setSettingsTier(a.intelligence_tier ?? 'standard')
        setSettingsVoiceId(a.voice_id ?? '')
        // Calendar tab
        setCalEventTypeId(a.cal_com_event_type_id ?? '')
        // Proposal tab — prefill from Business fields, so it's not manual double-entry
        setPropTitle(a.business_name ? `AI-lösning för ${a.business_name}` : '')
        setPropTagline((a.services ?? '').split('\n').filter(Boolean)[0] ?? '')
        // Calls tab
        setWebhookUrl(a.webhook_token ? `${window.location.origin}/api/webhooks/${a.webhook_token}` : '')
        setPublicDemoUrl(a.public_share_id ? `${window.location.origin}/prova/${a.public_share_id}` : '')
        setAirtableTableName(a.airtable_table_name ?? '')
        setLoading(false)
      })
  }, [id])

  // ── Lazy tab data — phone numbers, call logs, billing stats ─────────────
  // try/finally so a missing table (e.g. migration 013 not run yet) can't
  // leave the tab stuck on "Laddar…" forever.
  const loadPhoneNumbers = useCallback(async () => {
    setPhoneLoading(true)
    try {
      const { data } = await supabase.from('phone_numbers').select('*').eq('agent_id', id).order('created_at', { ascending: false })
      setPhoneNumbers((data ?? []) as PhoneNumber[])
    } finally {
      setPhoneLoading(false)
    }
  }, [id])

  const loadCallLogs = useCallback(async () => {
    setCallLogsLoading(true)
    try {
      const { data } = await supabase.from('call_logs').select('*').eq('agent_id', id).order('created_at', { ascending: false }).limit(50)
      setCallLogs((data ?? []) as CallLog[])
    } finally {
      setCallLogsLoading(false)
    }
  }, [id])

  const loadBillingStats = useCallback(async () => {
    const { data } = await supabase.from('call_logs').select('duration_sec, cost').eq('agent_id', id)
    const rows = data ?? []
    const totalSec = rows.reduce((sum, r) => sum + (r.duration_sec ?? 0), 0)
    const totalCost = rows.reduce((sum, r) => sum + (r.cost ?? 0), 0)
    setBillingStats({ calls: rows.length, minutes: Math.round(totalSec / 60), cost: totalCost })
  }, [id])

  const loadElevenLabsVoices = useCallback(async () => {
    setVoicesLoading(true)
    setVoicesError('')
    try {
      const res = await fetch('/api/elevenlabs/voices')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Okänt fel')
      setElevenLabsVoices(data.voices ?? [])
    } catch (err) {
      setVoicesError(err instanceof Error ? err.message : String(err))
    } finally {
      setVoicesLoading(false)
    }
  }, [])

  // Most premade voices in a fresh ElevenLabs account are English-trained —
  // they can speak Swedish via the multilingual model, but with an English
  // accent. This is ElevenLabs' actual native-Swedish Voice Library, not
  // yet imported into the account, so users aren't stuck with only that.
  const loadSwedishLibrary = useCallback(async () => {
    setLibraryLoading(true)
    setLibraryError('')
    try {
      const res = await fetch('/api/elevenlabs/swedish-voices')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Okänt fel')
      setSwedishLibraryVoices(data.voices ?? [])
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : String(err))
    } finally {
      setLibraryLoading(false)
    }
  }, [])

  async function importSwedishVoice(v: SharedSwedishVoice) {
    setImportingVoiceId(v.voiceId)
    setImportError('')
    try {
      const res = await fetch('/api/elevenlabs/voices/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicOwnerId: v.publicOwnerId, voiceId: v.voiceId, name: v.name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Okänt fel')
      await loadElevenLabsVoices()
      setSettingsVoiceId(data.voiceId)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err))
    } finally {
      setImportingVoiceId('')
    }
  }

  // Refs, not state, track "already fetched per tab" — the loaders above set
  // phoneLoading/callLogsLoading as UI state, and using that same state as an
  // effect dependency+guard caused an infinite refetch loop (false→true→false
  // is itself a dependency change, which re-ran the effect every time).
  const phoneFetchedRef = useRef(false)
  const callLogsFetchedRef = useRef(false)
  const billingFetchedRef = useRef(false)
  const voicesFetchedRef = useRef(false)
  const libraryFetchedRef = useRef(false)

  useEffect(() => {
    if (!id) return
    if (activeTab === 'phone' && !phoneFetchedRef.current) {
      phoneFetchedRef.current = true
      loadPhoneNumbers()
    }
    if (activeTab === 'calls' && !callLogsFetchedRef.current) {
      callLogsFetchedRef.current = true
      loadCallLogs()
    }
    if (activeTab === 'billing' && !billingFetchedRef.current) {
      billingFetchedRef.current = true
      loadBillingStats()
    }
    if (activeTab === 'settings' && !voicesFetchedRef.current) {
      voicesFetchedRef.current = true
      loadElevenLabsVoices()
    }
    if (activeTab === 'settings' && !libraryFetchedRef.current) {
      libraryFetchedRef.current = true
      loadSwedishLibrary()
    }
  }, [activeTab, id, loadPhoneNumbers, loadCallLogs, loadBillingStats, loadElevenLabsVoices, loadSwedishLibrary])

  // ── Save prompt tab ────────────────────────────────────────────────────
  async function savePrompt() {
    setSaving(true)
    setSaved(false)
    setSaveError('')
    const { error } = await supabase.from('agents').update({
      welcome_message: welcomeMessage || null,
      transfer_number: transferNumber || null,
      prompt_text: promptText || null,
    }).eq('id', id)
    if (error) { setSaveError(error.message) } else { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    setSaving(false)
  }

  // ── Save business tab ──────────────────────────────────────────────────
  async function saveBusiness() {
    setSaving(true)
    setSaved(false)
    setSaveError('')
    const { error } = await supabase.from('agents').update({
      business_name: businessName || null,
      industry: industry || null,
      description: description || null,
      target_customers: targetCustomers || null,
      services: services || null,
      pain_points: painPoints || null,
      goals: goals || null,
    }).eq('id', id)
    if (error) { setSaveError(error.message) } else { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    setSaving(false)
  }

  // ── Save settings tab ──────────────────────────────────────────────────
  async function saveSettings() {
    setSaving(true)
    setSaved(false)
    setSaveError('')
    const { error } = await supabase.from('agents').update({
      language: settingsLanguage,
      intelligence_tier: settingsTier,
      voice_id: settingsVoiceId || null,
    }).eq('id', id)
    if (error) { setSaveError(error.message) } else { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    setSaving(false)
  }

  async function deleteAgent() {
    if (!agent) return
    if (!confirm(`Ta bort agenten "${agent.name}" permanent? Detta går inte att ångra.`)) return
    await supabase.from('agents').delete().eq('id', id)
    window.location.href = '/ai-agents/receptionist'
  }

  // ── Calendar tab (Cal.com) ─────────────────────────────────────────────
  async function saveCalEventTypeId() {
    setSaving(true)
    setSaved(false)
    setSaveError('')
    const { error } = await supabase.from('agents').update({ cal_com_event_type_id: calEventTypeId || null }).eq('id', id)
    if (error) { setSaveError(error.message) } else { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    setSaving(false)
  }

  async function testAvailability() {
    setCalTesting(true)
    setCalResult(null)
    try {
      const res = await fetch('/api/cal-com/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventTypeId: calEventTypeId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Okänt fel')
      const slotCount = Array.isArray(data.slots) ? data.slots.length : Object.keys(data.slots ?? {}).length
      setCalResult({ ok: true, message: `Live-anrop lyckades — hittade ${slotCount} lediga tider de kommande 7 dagarna.` })
    } catch (err) {
      setCalResult({ ok: false, message: err instanceof Error ? err.message : String(err) })
    }
    setCalTesting(false)
  }

  // ── Phone tab (Twilio) ─────────────────────────────────────────────────
  async function searchNumbers() {
    setSearching(true)
    setPhoneError('')
    setSearchResults([])
    try {
      const res = await fetch(`/api/twilio/search-numbers?country=SE&areaCode=${encodeURIComponent(areaCode)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Okänt fel')
      setSearchResults(data.numbers ?? [])
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : String(err))
    }
    setSearching(false)
  }

  async function purchaseNumber(phoneNumber: string) {
    setPurchasingNumber(phoneNumber)
    setPhoneError('')
    try {
      const res = await fetch('/api/twilio/purchase-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: id, phoneNumber }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Okänt fel')
      setPhoneNumbers(prev => [data.phoneNumber, ...prev])
      setSearchResults(prev => prev.filter(n => n.phoneNumber !== phoneNumber))
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : String(err))
    }
    setPurchasingNumber('')
  }

  async function releaseNumber(phoneNumberId: string, twilioSid: string) {
    if (!confirm('Släpp det här numret? Det slutar fungera omedelbart.')) return
    setPhoneError('')
    try {
      const res = await fetch('/api/twilio/release-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumberId, twilioSid }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Okänt fel')
      setPhoneNumbers(prev => prev.filter(n => n.id !== phoneNumberId))
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : String(err))
    }
  }

  // ── Proposal tab — prefilled from Business tab ─────────────────────────
  async function createProposalFromAgent() {
    if (!propTitle.trim()) { setPropError('Rubrik krävs'); return }
    setPropCreating(true)
    setPropError('')
    const shareId = Math.random().toString(36).substring(2, 10)
    const { error } = await supabase.from('proposals').insert({
      title: propTitle.trim(),
      tagline: propTagline.trim() || null,
      avg_job_value: propValue ? Number(propValue) : null,
      is_public: true,
      status: 'draft',
      share_id: shareId,
      // Link it back to the agent so it also shows up in the Demos tab.
      agent_id: id,
      lead_id: agent?.lead_id ?? null,
    })
    setPropCreating(false)
    if (error) { setPropError(error.message); return }
    setPropShareId(shareId)
  }

  // ── AI Fix tab ──────────────────────────────────────────────────────────
  async function diagnoseFix() {
    if (!fixProblem.trim()) { setFixError('Beskriv problemet först'); return }
    setFixDiagnosing(true)
    setFixError('')
    setFixResult(null)
    setFixApplied(false)
    try {
      const res = await fetch('/api/ai-fix/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: id, problemDescription: fixProblem }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Okänt fel')
      setFixResult(data)
    } catch (err) {
      setFixError(err instanceof Error ? err.message : String(err))
    }
    setFixDiagnosing(false)
  }

  async function applyFix() {
    if (!fixResult) return
    setFixApplying(true)
    const { error } = await supabase.from('agents').update({ [fixResult.suggestedField]: fixResult.suggestedValue }).eq('id', id)
    setFixApplying(false)
    if (error) { setFixError(error.message); return }
    setFixApplied(true)
    setAgent(prev => prev ? { ...prev, [fixResult.suggestedField]: fixResult.suggestedValue } : prev)
    // Keep the visible tab fields in sync so re-opening Prompt/Business shows the applied fix
    if (fixResult.suggestedField === 'prompt_text') setPromptText(fixResult.suggestedValue)
    if (fixResult.suggestedField === 'welcome_message') setWelcomeMessage(fixResult.suggestedValue)
    if (fixResult.suggestedField === 'description') setDescription(fixResult.suggestedValue)
    if (fixResult.suggestedField === 'services') setServices(fixResult.suggestedValue)
    if (fixResult.suggestedField === 'pain_points') setPainPoints(fixResult.suggestedValue)
    if (fixResult.suggestedField === 'goals') setGoals(fixResult.suggestedValue)
  }

  // ── Calls tab — webhook + Airtable ─────────────────────────────────────
  async function generateWebhook() {
    setGeneratingWebhook(true)
    try {
      const res = await fetch('/api/webhooks/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Okänt fel')
      setWebhookUrl(data.url)
    } catch (err) {
      setAirtableResult({ ok: false, message: err instanceof Error ? err.message : String(err) })
    }
    setGeneratingWebhook(false)
  }

  async function saveAirtableTableName() {
    await supabase.from('agents').update({ airtable_table_name: airtableTableName || null }).eq('id', id)
  }

  // Public demo link — a prospect opens this and talks to the agent without
  // logging in. Generated on demand so an agent only gets a public URL when
  // the user actually wants to share it.
  async function generatePublicDemoLink() {
    setGeneratingDemoLink(true)
    setDemoLinkError('')
    const shareId = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6)
    const { error } = await supabase.from('agents').update({ public_share_id: shareId }).eq('id', id)
    if (error) {
      setDemoLinkError(
        error.message.includes('public_share_id')
          ? 'Kolumnen public_share_id saknas — kör migration 014_agent_public_demo.sql i Supabase först.'
          : error.message
      )
    } else {
      setPublicDemoUrl(`${window.location.origin}/prova/${shareId}`)
    }
    setGeneratingDemoLink(false)
  }

  async function copyDemoLink() {
    await navigator.clipboard.writeText(publicDemoUrl)
    setDemoLinkCopied(true)
    setTimeout(() => setDemoLinkCopied(false), 2000)
  }

  async function syncAirtable() {
    setSyncingAirtable(true)
    setAirtableResult(null)
    try {
      await saveAirtableTableName()
      const res = await fetch('/api/airtable/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Okänt fel')
      setAirtableResult({ ok: true, message: `${data.synced} samtal synkade till Airtable.` })
    } catch (err) {
      setAirtableResult({ ok: false, message: err instanceof Error ? err.message : String(err) })
    }
    setSyncingAirtable(false)
  }

  // ── Test call ─────────────────────────────────────────────────────────
  async function startCall() {
    setCallStatus('connecting')
    setTranscript([])
    setCallError('')
    setVoiceAppliedWarning('')

    try {
      // 1. Get signed URL + prompt from our backend
      const res = await fetch('/api/create-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Backend-anrop misslyckades')

      // Surface it up front instead of failing silently — an agent saved
      // before this fix (or with the field cleared) can still have a
      // non-ID value like "maja" sitting in voice_id.
      const voiceIdValid = !!data.voiceId && looksLikeElevenLabsVoiceId(data.voiceId)
      if (!data.voiceId) {
        setVoiceAppliedWarning('Ingen röst vald i Inställningar — agentens standardröst på ElevenLabs används.')
      } else if (!voiceIdValid) {
        setVoiceAppliedWarning(`Sparat röst-ID "${data.voiceId}" är ogiltigt och skickas inte — gå till Inställningar och välj en röst från listan.`)
      }

      // 2. Request microphone access
      await navigator.mediaDevices.getUserMedia({ audio: true })

      // 3. Dynamic import to avoid SSR issues, start session
      const { Conversation } = await import('@11labs/client')
      const conv = await Conversation.startSession({
        signedUrl: data.signedUrl,
        overrides: {
          agent: {
            ...(data.prompt ? { prompt: { prompt: data.prompt } } : {}),
            ...(data.welcomeMessage ? { firstMessage: data.welcomeMessage } : {}),
            language: data.language === 'en' ? 'en' : 'sv',
          },
          // Without this the call always uses whichever voice is configured
          // on the shared ELEVENLABS_AGENT_ID — every Loopr agent sounded
          // identical regardless of the voice picked at creation time. Only
          // send it when it's a real ElevenLabs ID — a garbage value like
          // "maja" would just get silently ignored by ElevenLabs anyway,
          // so there's no point sending it (and it's clearer to skip it and
          // warn above than to send something we know is invalid).
          ...(voiceIdValid ? { tts: { voiceId: data.voiceId } } : {}),
        },
        onConnect: () => setCallStatus('connected'),
        onDisconnect: () => {
          setCallStatus('idle')
          convRef.current = null
        },
        onError: (msg: string) => {
          setCallError(msg)
          setCallStatus('idle')
          convRef.current = null
          logCallError(msg)
        },
        onMessage: ({ message, source }: { message: string; source: 'user' | 'ai' }) => {
          setTranscript(prev => {
            const next = [...prev, { text: message, source }]
            setTimeout(() => transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
            return next
          })
        },
        onModeChange: ({ mode }: { mode: 'listening' | 'speaking' }) => setCallMode(mode),
      })
      convRef.current = conv
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setCallStatus('idle')
      setCallError(message)
      logCallError(message)
    }
  }

  // Write a failed call to call_logs instead of only showing a toast that
  // disappears when the page reloads — lets AI Fix and the Calls tab see it.
  async function logCallError(message: string) {
    await supabase.from('call_logs').insert({
      agent_id: id,
      status: 'error',
      error_message: message,
      transcript: transcript.length ? transcript.map(t => `${t.source}: ${t.text}`).join('\n') : null,
    })
  }

  async function endCall() {
    try {
      if (convRef.current) {
        await convRef.current.endSession()
        convRef.current = null
      }
    } catch { /* ignore cleanup errors */ }
    setCallStatus('idle')
    setCallMode('listening')
  }

  // ── Toggle deploy/pause ────────────────────────────────────────────────
  async function toggleStatus() {
    if (!agent) return
    const newStatus = agent.status === 'deployed' ? 'paused' : 'deployed'
    await supabase.from('agents').update({ status: newStatus }).eq('id', id)
    setAgent(prev => prev ? { ...prev, status: newStatus } : prev)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--slate)' }}>
        <span className="animate-spin">⟳</span> Laddar agent…
      </div>
    )
  }

  if (!agent) {
    return (
      <Panel padding="p-8" className="text-center" tiltMaxAngle={6}>
        <p style={{ color: 'var(--slate)' }}>Agent hittades inte.</p>
        <Link href="/ai-agents/receptionist" className="text-sm mt-4 inline-block hover:underline" style={{ color: 'var(--brick)' }}>
          ← Tillbaka till lista
        </Link>
      </Panel>
    )
  }

  const isDeployed = agent.status === 'deployed'

  return (
    <div className="space-y-5 pb-12">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--slate)' }}>
        <Link href="/ai-agents" className="hover:underline">AI Agenter</Link>
        <span>›</span>
        <Link href="/ai-agents/receptionist" className="hover:underline">Receptionister</Link>
        <span>›</span>
        <span style={{ color: 'var(--cream)' }}>{agent.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs tracking-widest mb-1" style={{ color: 'var(--brick)' }}>AI-RECEPTIONIST</p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
            {agent.name}
          </h1>
          {agent.business_name && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--slate)' }}>{agent.business_name}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1.5 rounded-lg"
            style={{
              backgroundColor: isDeployed ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.06)',
              color: isDeployed ? '#4ade80' : 'var(--slate)',
              border: `1px solid ${isDeployed ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.1)'}`,
            }}>
            {isDeployed ? '● Driftsatt' : agent.status === 'paused' ? '◌ Pausad' : '◌ Utkast'}
          </span>
          <button
            onClick={toggleStatus}
            className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
            style={{
              backgroundColor: isDeployed ? 'rgba(239,68,68,0.12)' : 'rgba(168,85,247,0.2)',
              color: isDeployed ? '#ef4444' : 'var(--brick)',
              border: `1px solid ${isDeployed ? 'rgba(239,68,68,0.25)' : 'rgba(168,85,247,0.3)'}`,
            }}
          >
            {isDeployed ? 'Pausa' : 'Driftsätt'}
          </button>
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0"
            style={{
              backgroundColor: activeTab === tab.id ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.04)',
              color: activeTab === tab.id ? 'var(--brick)' : 'var(--slate)',
              border: `1px solid ${activeTab === tab.id ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.06)'}`,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Prompt tab ───────────────────────────────────────────────────── */}
      {activeTab === 'prompt' && (
        <Panel padding="p-6" className="space-y-5" enableTilt={false}>
          <FieldInput
            label="Välkomsthälsning"
            value={welcomeMessage}
            onChange={setWelcomeMessage}
            placeholder="Hej! Du har nått oss. Hur kan jag hjälpa dig?"
          />
          <FieldInput
            label="Vidarekoppling-nummer"
            value={transferNumber}
            onChange={setTransferNumber}
            placeholder="070-123 45 67"
            type="tel"
          />
          <FieldTextarea
            label="Agent Prompt"
            value={promptText}
            onChange={setPromptText}
            placeholder="Skriv eller klistra in prompten…"
            rows={18}
            mono
          />
          <SaveBar saving={saving} saved={saved} error={saveError} onSave={savePrompt} />
        </Panel>
      )}

      {/* ── Business tab ─────────────────────────────────────────────────── */}
      {activeTab === 'business' && (
        <Panel padding="p-6" className="space-y-5" enableTilt={false}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldInput label="Företagsnamn" value={businessName} onChange={setBusinessName} placeholder="t.ex. Rörmokarna AB" />
            <FieldInput label="Bransch" value={industry} onChange={setIndustry} placeholder="t.ex. VVS, Elektriker, Städ…" />
          </div>
          <FieldTextarea
            label="Beskrivning av verksamheten"
            value={description}
            onChange={setDescription}
            placeholder="Beskriv vad företaget gör, hur länge de funnits, varför de är unika…"
            rows={3}
          />
          <FieldTextarea
            label="Målkunder"
            value={targetCustomers}
            onChange={setTargetCustomers}
            placeholder="Vilka kunder vänder ni er till? Privatpersoner, företag, ålder, geografi…"
            rows={2}
          />
          <FieldTextarea
            label="Tjänster (en per rad)"
            value={services}
            onChange={setServices}
            placeholder={"Akuta rörläckor\nBadrumsrenovering\nVärmeinstallation"}
            rows={4}
          />
          <FieldTextarea
            label="Smärtpunkter ni löser (en per rad)"
            value={painPoints}
            onChange={setPainPoints}
            placeholder={"Kunder vet inte vem de ska ringa\nLång väntetid hos konkurrenter\nOtydliga priser"}
            rows={3}
          />
          <FieldTextarea
            label="Affärsmål (en per rad)"
            value={goals}
            onChange={setGoals}
            placeholder={"Öka bokningar med 20%\nFå fler 5-stjärniga recensioner\nMinska ej besvarade samtal"}
            rows={3}
          />
          <SaveBar saving={saving} saved={saved} error={saveError} onSave={saveBusiness} />
        </Panel>
      )}

      {/* ── Test tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'test' && (
        <div className="space-y-4">
          <Panel
            padding="p-8"
            tiltMaxAngle={6}
            className="text-center"
            style={{
              backgroundColor: callStatus === 'connected' ? 'rgba(168,85,247,0.10)' : undefined,
              borderColor: callStatus === 'connected' ? 'rgba(168,85,247,0.35)' : undefined,
              transition: 'background-color 0.4s ease, border-color 0.4s ease',
            }}
          >
            {/* Mic orb — same visual language as the public demo page */}
            <div
              className="mx-auto mb-4 flex items-center justify-center rounded-full"
              style={{
                width: 92,
                height: 92,
                fontSize: 38,
                background: callStatus === 'connected'
                  ? (callMode === 'speaking' ? 'rgba(168,85,247,0.28)' : 'rgba(74,222,128,0.18)')
                  : 'rgba(255,255,255,0.05)',
                border: `2px solid ${callStatus === 'connected'
                  ? (callMode === 'speaking' ? 'rgba(168,85,247,0.6)' : 'rgba(74,222,128,0.5)')
                  : 'rgba(255,255,255,0.12)'}`,
                boxShadow: callStatus === 'connected'
                  ? `0 0 0 ${callMode === 'speaking' ? '14px' : '8px'} ${callMode === 'speaking' ? 'rgba(168,85,247,0.10)' : 'rgba(74,222,128,0.07)'}`
                  : 'none',
                transition: 'all 0.35s ease',
                animation: callStatus === 'connected' ? 'looprPulse 2s ease-in-out infinite' : 'none',
              }}
            >
              {callStatus === 'connecting' ? '⏳' : callStatus === 'connected' ? (callMode === 'speaking' ? '🔊' : '🎧') : '🎙'}
            </div>

            <p
              className="text-sm font-semibold mb-1"
              style={{
                color: callStatus === 'connected'
                  ? (callMode === 'speaking' ? 'var(--brick)' : '#4ade80')
                  : 'var(--cream)',
              }}
            >
              {callStatus === 'connecting' && 'Kopplar upp…'}
              {callStatus === 'connected' && (callMode === 'speaking' ? 'Agenten pratar…' : 'Lyssnar — prata på!')}
              {callStatus === 'idle' && 'Live Testsamtal'}
            </p>
            <p className="text-xs mb-5" style={{ color: 'var(--slate)' }}>
              {callStatus === 'idle'
                ? 'Prata direkt med agenten via mikrofonen. Agentens prompt, röst och välkomsthälsning används.'
                : 'Prata som du skulle göra i ett vanligt telefonsamtal.'}
            </p>

            {callStatus === 'idle' && (
              <button onClick={startCall}
                className="px-7 py-3 rounded-xl text-sm font-bold transition-all"
                style={{ backgroundColor: 'var(--brick)', color: 'white', boxShadow: '0 6px 22px rgba(168,85,247,0.3)' }}>
                🎙 Starta Testsamtal
              </button>
            )}
            {callStatus === 'connecting' && (
              <button disabled
                className="px-7 py-3 rounded-xl text-sm font-bold opacity-60 cursor-not-allowed"
                style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--slate)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <span className="animate-spin inline-block mr-1">⟳</span> Ansluter…
              </button>
            )}
            {callStatus === 'connected' && (
              <button onClick={endCall}
                className="px-6 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                ✕ Avsluta samtal
              </button>
            )}

            {voiceAppliedWarning && (
              <div className="mt-4 p-3 rounded-lg text-sm"
                style={{ backgroundColor: 'rgba(201,162,75,0.08)', border: '1px solid rgba(201,162,75,0.25)', color: 'var(--gold)' }}>
                ⚠️ {voiceAppliedWarning}
              </div>
            )}
            {callError && (
              <div className="mt-4 p-3 rounded-lg text-sm"
                style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                ⚠️ {callError}
              </div>
            )}
          </Panel>

          {/* Public demo link — share with a prospect so they can try the agent */}
          <Panel padding="p-6" enableTilt={false}>
            <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
              <div>
                <h3 className="font-semibold mb-0.5" style={{ color: 'var(--cream)' }}>Publik demolänk</h3>
                <p className="text-sm" style={{ color: 'var(--slate)' }}>
                  Skicka den här länken till en prospekt — de kan prata med agenten direkt i webbläsaren utan att logga in.
                </p>
              </div>
              {!publicDemoUrl && (
                <button
                  onClick={generatePublicDemoLink}
                  disabled={generatingDemoLink}
                  className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
                  style={{ backgroundColor: 'rgba(168,85,247,0.2)', color: 'var(--brick)', border: '1px solid rgba(168,85,247,0.3)' }}
                >
                  {generatingDemoLink ? '⟳ Skapar…' : '🔗 Skapa demolänk'}
                </button>
              )}
            </div>

            {publicDemoUrl && (
              <div className="flex items-center gap-2 flex-wrap">
                <code
                  className="flex-1 min-w-0 truncate text-xs px-3 py-2 rounded-lg"
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--cream)' }}
                >
                  {publicDemoUrl}
                </code>
                <button
                  onClick={copyDemoLink}
                  className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    backgroundColor: demoLinkCopied ? 'rgba(74,222,128,0.15)' : 'rgba(168,85,247,0.15)',
                    color: demoLinkCopied ? '#4ade80' : 'var(--brick)',
                    border: `1px solid ${demoLinkCopied ? 'rgba(74,222,128,0.3)' : 'rgba(168,85,247,0.25)'}`,
                  }}
                >
                  {demoLinkCopied ? '✓ Kopierad' : 'Kopiera'}
                </button>
                <a
                  href={publicDemoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                  style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--slate)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  Öppna ↗
                </a>
              </div>
            )}

            {demoLinkError && (
              <p className="text-xs mt-3" style={{ color: '#ef4444' }}>⚠️ {demoLinkError}</p>
            )}
          </Panel>

          {/* Transcript */}
          {(callStatus !== 'idle' || transcript.length > 0) && (
            <Panel padding="p-5" tiltMaxAngle={6}>
              <p className="text-[10px] font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--slate)' }}>
                Transkript
              </p>
              {transcript.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: 'var(--slate)' }}>
                  Väntar på att samtalet ska börja…
                </p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {transcript.map((item, i) => (
                    <div key={i} className={`flex ${item.source === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-sm px-3 py-2 rounded-xl text-sm"
                        style={{
                          backgroundColor: item.source === 'user' ? 'rgba(168,85,247,0.18)' : 'rgba(255,255,255,0.06)',
                          color: item.source === 'user' ? 'var(--brick)' : 'var(--cream)',
                          border: `1px solid ${item.source === 'user' ? 'rgba(168,85,247,0.3)' : 'rgba(255,255,255,0.1)'}`,
                        }}>
                        <span className="text-[9px] font-bold uppercase block mb-0.5 opacity-50">
                          {item.source === 'user' ? 'Du' : agent.name}
                        </span>
                        {item.text}
                      </div>
                    </div>
                  ))}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </Panel>
          )}
        </div>
      )}

      {/* ── Settings tab ─────────────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <Panel padding="p-6" className="space-y-5" enableTilt={false}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>Språk</label>
              <Dropdown
                value={settingsLanguage}
                onChange={setSettingsLanguage}
                className="w-full"
                style={inputStyle}
                options={[{ value: 'sv', label: '🇸🇪 Svenska' }, { value: 'en', label: '🇬🇧 Engelska' }]}
              />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>Intelligensnivå</label>
              <Dropdown
                value={settingsTier}
                onChange={setSettingsTier}
                className="w-full"
                style={inputStyle}
                options={[{ value: 'standard', label: 'Standard' }, { value: 'turbo', label: 'Turbo ⚡' }]}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>Röst</label>
            {voicesLoading ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--slate)' }}>
                <span className="animate-spin">⟳</span> Hämtar röster från ElevenLabs…
              </div>
            ) : voicesError ? (
              <div className="space-y-2">
                <p className="text-sm" style={{ color: '#ef4444' }}>⚠️ Kunde inte hämta röstlistan: {voicesError}</p>
                <input
                  value={settingsVoiceId}
                  onChange={e => setSettingsVoiceId(e.target.value)}
                  placeholder="Ange ElevenLabs röst-ID manuellt, t.ex. 21m00Tcm4TlvDq8ikWAM"
                  style={inputStyle}
                />
              </div>
            ) : (
              <>
                <Dropdown
                  value={settingsVoiceId}
                  onChange={setSettingsVoiceId}
                  className="w-full"
                  style={inputStyle}
                  placeholder="— Välj röst —"
                  options={[...elevenLabsVoices]
                    // Swedish-tagged voices first — most premade voices in a
                    // fresh account are English-trained and can speak Swedish
                    // via the multilingual model, but with an English accent.
                    .sort((a, b) => (b.language === 'sv' ? 1 : 0) - (a.language === 'sv' ? 1 : 0))
                    .map(v => ({
                      value: v.voiceId,
                      label: `${v.language === 'sv' ? '🇸🇪 ' : ''}${v.name}${v.accent ? ` (${v.accent})` : ''}`,
                    }))}
                />
                {!elevenLabsVoices.some(v => v.language === 'sv') && (
                  <p className="text-xs mt-1.5" style={{ color: 'var(--gold)' }}>
                    ⚠️ Inga genuint svenska röster i ditt ElevenLabs-bibliotek än — övriga röster ovan kan tala
                    svenska via multilingual-modellen men låter ofta engelskbrytna. Lägg till en riktig svensk röst nedan.
                  </p>
                )}
              </>
            )}
            {settingsVoiceId && !looksLikeElevenLabsVoiceId(settingsVoiceId) && (
              <p className="text-xs mt-1.5" style={{ color: '#ef4444' }}>
                ⚠️ &quot;{settingsVoiceId}&quot; ser inte ut som ett giltigt ElevenLabs röst-ID (bör vara ~20 tecken).
                ElevenLabs ignorerar ogiltiga värden tyst och använder agentens standardröst istället — det är
                troligen därför röstbytet inte hörs. Välj en röst från listan ovan.
              </p>
            )}
            <p className="text-[11px] mt-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Listan hämtas live från ditt ElevenLabs-konto, så ID:na är alltid giltiga. Se också till att din
              ElevenLabs-agent har &quot;Allow override&quot; aktiverat för <strong>Voice</strong> (inte bara
              System prompt och First message) — annars ignoreras vårt röstval av ElevenLabs oavsett vad vi skickar.
            </p>

            {/* Import genuine Swedish voices from ElevenLabs' shared Voice Library */}
            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <button
                onClick={() => setShowMoreSwedishVoices(v => !v)}
                className="text-xs font-semibold flex items-center gap-1.5"
                style={{ color: 'var(--brick)' }}
              >
                {showMoreSwedishVoices ? '▾' : '▸'} 🇸🇪 Lägg till fler svenska röster
                {swedishLibraryVoices.length > 0 && (
                  <span style={{ color: 'var(--slate)', fontWeight: 400 }}>
                    ({swedishLibraryVoices.filter(v => !elevenLabsVoices.some(mine => mine.voiceId === v.voiceId)).length} tillgängliga)
                  </span>
                )}
              </button>
              {showMoreSwedishVoices && (
                <div className="mt-3 space-y-2">
                  {libraryLoading ? (
                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--slate)' }}>
                      <span className="animate-spin">⟳</span> Söker i ElevenLabs Voice Library…
                    </div>
                  ) : libraryError ? (
                    <p className="text-sm" style={{ color: '#ef4444' }}>⚠️ {libraryError}</p>
                  ) : (
                    <>
                      {importError && <p className="text-sm" style={{ color: '#ef4444' }}>⚠️ {importError}</p>}
                      {swedishLibraryVoices
                        .filter(v => !elevenLabsVoices.some(mine => mine.voiceId === v.voiceId))
                        .map(v => (
                          <div key={v.voiceId} className="flex items-center justify-between gap-3 p-2.5 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                            <div className="flex items-center gap-2 min-w-0">
                              {v.previewUrl && (
                                // eslint-disable-next-line jsx-a11y/media-has-caption
                                <audio controls src={v.previewUrl} style={{ height: 28, width: 160 }} />
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate" style={{ color: 'var(--cream)' }}>{v.name}</p>
                                <p className="text-[10px]" style={{ color: 'var(--slate)' }}>{v.accent ?? 'svenska'}{v.gender ? ` · ${v.gender}` : ''}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => importSwedishVoice(v)}
                              disabled={importingVoiceId === v.voiceId}
                              className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all disabled:opacity-40"
                              style={{ backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}
                            >
                              {importingVoiceId === v.voiceId ? '⟳' : '+ Lägg till'}
                            </button>
                          </div>
                        ))}
                      {swedishLibraryVoices.filter(v => !elevenLabsVoices.some(mine => mine.voiceId === v.voiceId)).length === 0 && (
                        <p className="text-sm" style={{ color: 'var(--slate)' }}>Alla hittade svenska röster är redan tillagda.</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          <SaveBar saving={saving} saved={saved} error={saveError} onSave={saveSettings} />
          <div className="pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <p className="text-xs font-semibold tracking-wide uppercase mb-2" style={{ color: '#ef4444' }}>Farlig zon</p>
            <button
              onClick={deleteAgent}
              className="text-xs px-3 py-2 rounded-lg font-semibold transition-colors hover:bg-white/5"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              🗑 Ta bort agent permanent
            </button>
          </div>
        </Panel>
      )}

      {/* ── Calendar tab (Cal.com) ───────────────────────────────────────── */}
      {activeTab === 'calendar' && (
        <Panel padding="p-6" className="space-y-5" enableTilt={false}>
          <div>
            <p className="font-semibold" style={{ color: 'var(--cream)' }}>Cal.com-koppling</p>
            <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>
              Kopplar agentens bokningsförmåga till ett Cal.com Event Type. Själva API-nyckeln (CAL_COM_API_KEY)
              konfigureras i servermiljön, aldrig här — bara Event Type-ID:t, som inte är hemligt.
            </p>
          </div>
          <FieldInput label="Cal.com Event Type ID" value={calEventTypeId} onChange={setCalEventTypeId} placeholder="t.ex. 123456" />
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={saveCalEventTypeId}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
              style={{ backgroundColor: 'var(--brick)', color: 'var(--cream)' }}
            >
              {saving ? '⟳ Sparar…' : 'Spara'}
            </button>
            <button
              onClick={testAvailability}
              disabled={calTesting || !calEventTypeId}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
              style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: 'var(--brick)', border: '1px solid rgba(168,85,247,0.3)' }}
            >
              {calTesting ? '⟳ Testar…' : '🔍 Test Availability'}
            </button>
            {saved && <p className="text-xs" style={{ color: '#4ade80' }}>✓ Sparad</p>}
          </div>
          {calResult && (
            <p className="text-sm" style={{ color: calResult.ok ? '#4ade80' : '#ef4444' }}>
              {calResult.ok ? '✓' : '⚠️'} {calResult.message}
            </p>
          )}
        </Panel>
      )}

      {/* ── Phone tab (Twilio) ───────────────────────────────────────────── */}
      {activeTab === 'phone' && (
        <div className="space-y-4">
          <Panel padding="p-6" className="space-y-4" enableTilt={false}>
            <p className="font-semibold" style={{ color: 'var(--cream)' }}>Sök telefonnummer</p>
            <div className="flex gap-3 flex-wrap">
              <input
                value={areaCode}
                onChange={e => setAreaCode(e.target.value)}
                placeholder="Riktnummer eller sökmönster, t.ex. 08"
                style={{ ...inputStyle, maxWidth: 280 }}
              />
              <button
                onClick={searchNumbers}
                disabled={searching}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
                style={{ backgroundColor: 'rgba(168,85,247,0.2)', color: 'var(--brick)', border: '1px solid rgba(168,85,247,0.3)' }}
              >
                {searching ? '⟳ Söker…' : '🔍 Sök'}
              </button>
            </div>
            {phoneError && <p className="text-sm" style={{ color: '#ef4444' }}>⚠️ {phoneError}</p>}
            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map(n => (
                  <div key={n.phoneNumber} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                    <div>
                      <p style={{ color: 'var(--cream)' }}>{n.phoneNumber}</p>
                      <p className="text-xs" style={{ color: 'var(--slate)' }}>{n.locality ?? n.friendlyName}</p>
                    </div>
                    <button
                      onClick={() => purchaseNumber(n.phoneNumber)}
                      disabled={purchasingNumber === n.phoneNumber}
                      className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all disabled:opacity-40"
                      style={{ backgroundColor: 'var(--brick)', color: 'white' }}
                    >
                      {purchasingNumber === n.phoneNumber ? '⟳' : 'Köp'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel padding="p-0" className="overflow-hidden" enableTilt={false}>
            <div className="px-5 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--slate)' }}>Kopplade nummer</p>
            </div>
            {phoneLoading ? (
              <p className="p-5 text-sm" style={{ color: 'var(--slate)' }}>Laddar…</p>
            ) : phoneNumbers.length === 0 ? (
              <p className="p-5 text-sm" style={{ color: 'var(--slate)' }}>Inga nummer köpta än — sök och köp ett ovan.</p>
            ) : (
              <div>
                {phoneNumbers.map(n => (
                  <div key={n.id} className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <div>
                      <p style={{ color: 'var(--cream)' }}>{n.phone_number}</p>
                      <p className="text-xs" style={{ color: 'var(--slate)' }}>Köpt {new Date(n.created_at).toLocaleDateString('sv-SE')}</p>
                    </div>
                    <button
                      onClick={() => releaseNumber(n.id, n.twilio_sid)}
                      className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors hover:bg-white/5"
                      style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}
                    >
                      Släpp
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* ── Proposal tab — prefilled from Business ───────────────────────── */}
      {activeTab === 'proposal' && (
        <Panel padding="p-6" className="space-y-4" enableTilt={false}>
          <p className="text-xs" style={{ color: 'var(--slate)' }}>
            Förifyllt från Business-fliken ({agent.business_name || 'inget företagsnamn ännu'}) — justera vid behov innan du skapar.
          </p>
          <FieldInput label="Rubrik" value={propTitle} onChange={setPropTitle} placeholder="t.ex. AI-lösning för Rörmokarna AB" />
          <FieldInput label="Tagline" value={propTagline} onChange={setPropTagline} placeholder="Kort säljande beskrivning" />
          <FieldInput label="Uppskattat värde (kr)" value={propValue} onChange={setPropValue} type="number" placeholder="24900" />
          {propError && <p className="text-sm" style={{ color: '#ef4444' }}>⚠️ {propError}</p>}
          {propShareId ? (
            <div className="p-3 rounded-lg flex items-center justify-between gap-3 flex-wrap" style={{ backgroundColor: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)' }}>
              <p className="text-sm" style={{ color: '#4ade80' }}>✓ Förslag skapat</p>
              <Link href={`/forslag/${propShareId}`} target="_blank" className="text-sm font-semibold hover:underline" style={{ color: 'var(--brick)' }}>
                Visa förslag →
              </Link>
            </div>
          ) : (
            <button
              onClick={createProposalFromAgent}
              disabled={propCreating}
              className="px-5 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
              style={{ backgroundColor: 'var(--brick)', color: 'var(--cream)' }}
            >
              {propCreating ? '⟳ Skapar…' : '+ Skapa nytt förslag'}
            </button>
          )}
        </Panel>
      )}

      {/* ── Demos tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'demos' && (
        <DemosTab
          agent={{
            id: agent.id,
            name: agent.name,
            business_name: agent.business_name,
            lead_id: agent.lead_id,
            public_share_id: agent.public_share_id,
          }}
        />
      )}

      {/* ── AI Fix tab ────────────────────────────────────────────────────── */}
      {activeTab === 'aifix' && (
        <Panel padding="p-6" className="space-y-4" enableTilt={false}>
          <FieldTextarea
            label="Beskriv problemet"
            value={fixProblem}
            onChange={setFixProblem}
            rows={3}
            placeholder="t.ex. Agenten missförstår när kunder frågar om priser och gissar fel belopp…"
          />
          <button
            onClick={diagnoseFix}
            disabled={fixDiagnosing}
            className="px-5 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
            style={{ backgroundColor: 'var(--brick)', color: 'var(--cream)' }}
          >
            {fixDiagnosing ? '⟳ Analyserar samtal…' : '🩺 Diagnose & Fix'}
          </button>
          {fixError && <p className="text-sm" style={{ color: '#ef4444' }}>⚠️ {fixError}</p>}
          {fixResult && (
            <div className="space-y-3 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <p className="text-sm" style={{ color: 'var(--cream)' }}>{fixResult.diagnosis}</p>
              <p className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--slate)' }}>
                Föreslagen ändring: {fixResult.suggestedField}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: '#ef4444' }}>Nuvarande</p>
                  <pre className="text-xs p-3 rounded-lg whitespace-pre-wrap max-h-52 overflow-y-auto" style={{ backgroundColor: 'rgba(239,68,68,0.06)', color: 'var(--slate)', fontFamily: 'inherit' }}>
                    {fixResult.currentValue || '(tomt)'}
                  </pre>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: '#4ade80' }}>Föreslaget</p>
                  <pre className="text-xs p-3 rounded-lg whitespace-pre-wrap max-h-52 overflow-y-auto" style={{ backgroundColor: 'rgba(74,222,128,0.06)', color: 'var(--cream)', fontFamily: 'inherit' }}>
                    {fixResult.suggestedValue}
                  </pre>
                </div>
              </div>
              {fixApplied ? (
                <p className="text-sm" style={{ color: '#4ade80' }}>✓ Ändringen har sparats på agenten</p>
              ) : (
                <button
                  onClick={applyFix}
                  disabled={fixApplying}
                  className="px-5 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
                  style={{ backgroundColor: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}
                >
                  {fixApplying ? '⟳ Sparar…' : '✓ Applicera fix'}
                </button>
              )}
            </div>
          )}
        </Panel>
      )}

      {/* ── Billing tab ───────────────────────────────────────────────────── */}
      {activeTab === 'billing' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Panel padding="p-5" tiltMaxAngle={6}>
            <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--slate)' }}>Samtal totalt</p>
            <p className="text-3xl font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>{billingStats?.calls ?? '—'}</p>
          </Panel>
          <Panel padding="p-5" tiltMaxAngle={6}>
            <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--slate)' }}>Minuter använda</p>
            <p className="text-3xl font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--brick)' }}>{billingStats?.minutes ?? '—'}</p>
          </Panel>
          <Panel padding="p-5" tiltMaxAngle={6}>
            <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--slate)' }}>Kostnad</p>
            <p className="text-3xl font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--gold)' }}>
              {billingStats ? `${billingStats.cost.toFixed(2)} kr` : '—'}
            </p>
          </Panel>
          <Panel padding="p-5" enableTilt={false} className="sm:col-span-3 flex items-center justify-between gap-4 flex-wrap" tiltMaxAngle={6}>
            <p className="text-sm" style={{ color: 'var(--slate)' }}>Behöver den här agenten fler minuter?</p>
            <Link href="/kop-minuter" className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80" style={{ backgroundColor: 'var(--brick)', color: 'white' }}>
              Köp Minuter →
            </Link>
          </Panel>
        </div>
      )}

      {/* ── Calls tab — webhook + Airtable + log ─────────────────────────── */}
      {activeTab === 'calls' && (
        <div className="space-y-4">
          <Panel padding="p-5" className="space-y-3" tiltMaxAngle={6}>
            <p className="font-semibold" style={{ color: 'var(--cream)' }}>Webhook</p>
            <p className="text-xs" style={{ color: 'var(--slate)' }}>
              POST:a samtalsdata hit så hamnar det i loggen nedan — för Zapier, en egen integration, eller ett test-curl.
            </p>
            {webhookUrl ? (
              <div className="flex items-center gap-2 flex-wrap">
                <code className="flex-1 text-xs px-3 py-2 rounded-lg overflow-x-auto min-w-0" style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--cream)' }}>
                  {webhookUrl}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(webhookUrl)}
                  className="text-xs px-3 py-2 rounded-lg font-semibold transition-colors hover:bg-white/5"
                  style={{ color: 'var(--slate)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  Kopiera
                </button>
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--slate)' }}>Ingen webhook genererad än.</p>
            )}
            <button
              onClick={generateWebhook}
              disabled={generatingWebhook}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
              style={{ backgroundColor: 'rgba(168,85,247,0.2)', color: 'var(--brick)', border: '1px solid rgba(168,85,247,0.3)' }}
            >
              {generatingWebhook ? '⟳ Genererar…' : webhookUrl ? '↻ Generera ny webhook' : '+ Generate Webhook'}
            </button>
          </Panel>

          <Panel padding="p-5" className="space-y-3" tiltMaxAngle={6}>
            <p className="font-semibold" style={{ color: 'var(--cream)' }}>Airtable-synk</p>
            <p className="text-xs" style={{ color: 'var(--slate)' }}>
              Kräver AIRTABLE_API_KEY och AIRTABLE_BASE_ID i servermiljön. Tabellnamnet nedan är inte hemligt och sparas på agenten.
            </p>
            <FieldInput label="Airtable-tabellnamn" value={airtableTableName} onChange={setAirtableTableName} placeholder="t.ex. Samtal" />
            <button
              onClick={syncAirtable}
              disabled={syncingAirtable || !airtableTableName.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
              style={{ backgroundColor: 'rgba(168,85,247,0.2)', color: 'var(--brick)', border: '1px solid rgba(168,85,247,0.3)' }}
            >
              {syncingAirtable ? '⟳ Synkar…' : '↻ Synka till Airtable'}
            </button>
            {airtableResult && (
              <p className="text-sm" style={{ color: airtableResult.ok ? '#4ade80' : '#ef4444' }}>
                {airtableResult.ok ? '✓' : '⚠️'} {airtableResult.message}
              </p>
            )}
          </Panel>

          <Panel padding="p-0" className="overflow-hidden" enableTilt={false}>
            <div className="px-5 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--slate)' }}>Samtalslogg</p>
            </div>
            {callLogsLoading ? (
              <p className="p-5 text-sm" style={{ color: 'var(--slate)' }}>Laddar…</p>
            ) : callLogs.length === 0 ? (
              <p className="p-5 text-sm" style={{ color: 'var(--slate)' }}>Inga samtal loggade än.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {['Från', 'Till', 'Status', 'Längd', 'Sammanfattning', 'Datum'].map(col => (
                        <th key={col} className="px-4 py-2.5 text-left text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--slate)' }}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {callLogs.map((c, i) => (
                      <tr key={c.id} style={{ borderBottom: i < callLogs.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--slate)' }}>{c.from_number ?? '—'}</td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--slate)' }}>{c.to_number ?? '—'}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: c.status === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(74,222,128,0.12)',
                              color: c.status === 'error' ? '#ef4444' : '#4ade80',
                            }}
                          >
                            {c.status === 'error' ? 'Fel' : c.status === 'in_progress' ? 'Pågår' : 'Klart'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--cream)' }}>{c.duration_sec ? `${Math.round(c.duration_sec / 60)} min` : '—'}</td>
                        <td className="px-4 py-2.5 text-xs max-w-xs truncate" style={{ color: 'var(--slate)' }} title={c.error_message ?? c.summary ?? ''}>
                          {c.error_message ?? c.summary ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--slate)' }}>{new Date(c.created_at).toLocaleDateString('sv-SE')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  )
}

// ─── Save bar ─────────────────────────────────────────────────────────────────
function SaveBar({ saving, saved, error, onSave }: {
  saving: boolean; saved: boolean; error: string; onSave: () => void
}) {
  return (
    <div className="flex items-center justify-between pt-2 border-t gap-4" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
      <div>
        {error && <p className="text-xs" style={{ color: '#ef4444' }}>⚠️ {error}</p>}
        {saved && <p className="text-xs" style={{ color: '#4ade80' }}>✓ Sparad</p>}
      </div>
      <button
        onClick={onSave}
        disabled={saving}
        className="px-5 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
        style={{ backgroundColor: 'var(--brick)', color: 'var(--cream)' }}
      >
        {saving ? '⟳ Sparar…' : 'Spara ändringar'}
      </button>
    </div>
  )
}
