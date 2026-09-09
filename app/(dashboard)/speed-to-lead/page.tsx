'use client'

import { useState, useEffect } from 'react'
import Panel from '@/app/components/Panel'
import Dropdown from '@/app/components/Dropdown'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface StlAgent {
  id: string
  agent_name: string
  business_name: string | null
  phone_number: string | null
  voice_id: string | null
  opening_message: string | null
  service_requested: string | null
  qualification_questions: string[]
  disqualify_conditions: string[]
  created_at: string
}

interface Stats {
  nya_leads: number
  ringda: number
  besvarade: number
  kvalificerade: number
  email_skickade: number
  bokade: number
  inget_svar: number
}

// ─── Constants ────────────────────────────────────────────────────────────────
const VOICES = [
  { id: 'sv-freya',   label: 'Freya — Naturlig, Kvinna (SV)' },
  { id: 'sv-maja',    label: 'Maja — Varm & Vänlig, Kvinna (SV)' },
  { id: 'sv-erik',    label: 'Erik — Professionell, Man (SV)' },
  { id: 'sv-lars',    label: 'Lars — Tydlig & Lugn, Man (SV)' },
  { id: 'en-rachel',  label: 'Rachel — Natural, Female (EN)' },
  { id: 'en-adam',    label: 'Adam — Professional, Male (EN)' },
]

const STAT_CONFIG = [
  { key: 'nya_leads',     label: 'Nya Leads',             icon: '📥', color: 'var(--cream)' },
  { key: 'ringda',        label: 'Leads Ringda',          icon: '📞', color: 'var(--gold)' },
  { key: 'besvarade',     label: 'Samtal Besvarade',      icon: '✅', color: '#4ade80' },
  { key: 'kvalificerade', label: 'Kvalificerade',         icon: '⭐', color: 'var(--brick)' },
  { key: 'email_skickade',label: 'Bokningsmejl Skickade', icon: '📧', color: '#60a5fa' },
  { key: 'bokade',        label: 'Bokade',                icon: '📅', color: 'var(--gold)' },
  { key: 'inget_svar',    label: 'Inget Svar',            icon: '📵', color: 'var(--slate)' },
  { key: 'konv',          label: 'Konvertering',          icon: '📈', color: '#a78bfa' },
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

// ─── Create Agent Modal ───────────────────────────────────────────────────────
function CreateAgentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (a: StlAgent) => void }) {
  const [agentName, setAgentName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [voiceId, setVoiceId] = useState(VOICES[0].id)
  const [openingMsg, setOpeningMsg] = useState(
    'Hej {{lead_first_name}}! Jag ringer från {{business_name}} angående din förfrågan om {{service_requested}}. Har du en minut?'
  )
  const [serviceRequested, setServiceRequested] = useState('')
  const [qualQuestions, setQualQuestions] = useState<string[]>([''])
  const [disqualConds, setDisqualConds] = useState<string[]>([''])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!agentName.trim()) { setError('Agentnamn krävs'); return }
    setSaving(true)
    setError('')
    const { data, error: dbErr } = await supabase
      .from('speed_to_lead_agents')
      .insert({
        agent_name: agentName.trim(),
        business_name: businessName.trim() || null,
        voice_id: voiceId,
        opening_message: openingMsg.trim() || null,
        service_requested: serviceRequested.trim() || null,
        qualification_questions: qualQuestions.filter(q => q.trim()),
        disqualify_conditions: disqualConds.filter(c => c.trim()),
      })
      .select()
      .single()
    setSaving(false)
    if (dbErr) { setError(dbErr.message); return }
    onCreated(data as unknown as StlAgent)
  }

  function updateQual(i: number, val: string) {
    setQualQuestions(prev => prev.map((q, idx) => idx === i ? val : q))
  }
  function addQual() { setQualQuestions(prev => [...prev, '']) }
  function removeQual(i: number) { setQualQuestions(prev => prev.filter((_, idx) => idx !== i)) }

  function updateCond(i: number, val: string) {
    setDisqualConds(prev => prev.map((c, idx) => idx === i ? val : c))
  }
  function addCond() { setDisqualConds(prev => [...prev, '']) }
  function removeCond(i: number) { setDisqualConds(prev => prev.filter((_, idx) => idx !== i)) }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10"
        style={{ backgroundColor: 'rgba(21,19,19,0.98)' }}>
        <div className="p-6 space-y-5">
          {/* Modal header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs tracking-widest font-semibold" style={{ color: 'var(--brick)' }}>NY AGENT</p>
              <h2 className="text-xl font-bold mt-0.5" style={{ color: 'var(--cream)', fontFamily: 'Arial, Helvetica, sans-serif' }}>
                Speed-to-Lead Agent
              </h2>
            </div>
            <button onClick={onClose} className="text-2xl leading-none" style={{ color: 'var(--slate)' }}>×</button>
          </div>

          {/* Agent name + Business */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ModalField label="Agentnamn *">
              <input style={inputStyle} value={agentName} onChange={e => setAgentName(e.target.value)}
                placeholder="t.ex. VVS Speed Agent" />
            </ModalField>
            <ModalField label="Företagsnamn">
              <input style={inputStyle} value={businessName} onChange={e => setBusinessName(e.target.value)}
                placeholder="t.ex. Rörmokarna AB" />
            </ModalField>
          </div>

          {/* Phone number (placeholder) */}
          <ModalField label="Telefonnummer">
            <div className="flex items-center gap-2">
              <input
                style={{ ...inputStyle, flex: 1, opacity: 0.45, cursor: 'not-allowed' }}
                disabled
                value=""
                placeholder="+46 XX XXX XX XX"
              />
              <button disabled
                className="px-3 py-2 rounded-lg text-xs font-semibold opacity-40 cursor-not-allowed whitespace-nowrap"
                style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: 'var(--brick)', border: '1px solid rgba(168,85,247,0.25)' }}>
                Köp nummer
              </button>
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--slate)' }}>
              ℹ️ Telefoni kopplas in i en kommande uppdatering. Du kan skapa agenten redan nu.
            </p>
          </ModalField>

          {/* Voice */}
          <ModalField label="Röst (ElevenLabs — kopplas snart)">
            <Dropdown
              value={voiceId}
              onChange={setVoiceId}
              style={inputStyle}
              options={VOICES.map(v => ({ value: v.id, label: v.label }))}
            />
          </ModalField>

          {/* Service requested */}
          <ModalField label="Tjänst leadet förfrågat">
            <input style={inputStyle} value={serviceRequested} onChange={e => setServiceRequested(e.target.value)}
              placeholder="t.ex. Rörinstallation, Badrumsrenovering…" />
          </ModalField>

          {/* Opening message */}
          <ModalField label="Öppningsmeddelande">
            <textarea
              value={openingMsg}
              onChange={e => setOpeningMsg(e.target.value)}
              rows={4}
              className="resize-y outline-none"
              style={inputStyle}
            />
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--slate)' }}>
              Variabler: <code style={{ color: 'var(--gold)' }}>{'{{lead_first_name}}'}</code>{' '}
              <code style={{ color: 'var(--gold)' }}>{'{{service_requested}}'}</code>{' '}
              <code style={{ color: 'var(--gold)' }}>{'{{business_name}}'}</code>
            </p>
          </ModalField>

          {/* Qualification questions */}
          <ModalField label="Kvalificeringsfrågor">
            <div className="space-y-2">
              {qualQuestions.map((q, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input style={{ ...inputStyle, flex: 1 }} value={q}
                    onChange={e => updateQual(i, e.target.value)}
                    placeholder={`Fråga ${i + 1}, t.ex. "Har du en bestämd tidslinje?"`} />
                  {qualQuestions.length > 1 && (
                    <button onClick={() => removeQual(i)} className="text-xs px-1.5 py-1 rounded"
                      style={{ color: 'var(--slate)' }}>✕</button>
                  )}
                </div>
              ))}
              <button onClick={addQual}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--slate)', border: '1px solid rgba(255,255,255,0.1)' }}>
                + Lägg till fråga
              </button>
            </div>
          </ModalField>

          {/* Disqualify conditions */}
          <ModalField label='Diskvalificera om…'>
            <div className="space-y-2">
              {disqualConds.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input style={{ ...inputStyle, flex: 1 }} value={c}
                    onChange={e => updateCond(i, e.target.value)}
                    placeholder={`Villkor ${i + 1}, t.ex. "Leadet är utanför service-området"`} />
                  {disqualConds.length > 1 && (
                    <button onClick={() => removeCond(i)} className="text-xs px-1.5 py-1 rounded"
                      style={{ color: 'var(--slate)' }}>✕</button>
                  )}
                </div>
              ))}
              <button onClick={addCond}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--slate)', border: '1px solid rgba(255,255,255,0.1)' }}>
                + Lägg till villkor
              </button>
            </div>
          </ModalField>

          {/* Error + Save */}
          {error && (
            <p className="text-xs p-3 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
              ⚠️ {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-3 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg"
              style={{ color: 'var(--slate)' }}>Avbryt</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: 'var(--brick)', color: 'var(--cream)' }}>
              {saving ? '⟳ Sparar…' : 'Spara Agent'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold tracking-wide uppercase block mb-1.5" style={{ color: 'var(--slate)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SpeedToLeadPage() {
  const [agents, setAgents] = useState<StlAgent[]>([])
  const [stats, setStats] = useState<Stats>({ nya_leads: 0, ringda: 0, besvarade: 0, kvalificerade: 0, email_skickade: 0, bokade: 0, inget_svar: 0 })
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('speed_to_lead_agents').select('*').order('created_at', { ascending: false }),
      supabase.from('speed_to_lead_calls').select('status'),
    ]).then(([agentsRes, callsRes]) => {
      setAgents((agentsRes.data ?? []) as unknown as StlAgent[])

      const calls = (callsRes.data ?? []) as { status: string }[]
      const count = (s: string[]) => calls.filter(c => s.includes(c.status)).length
      setStats({
        nya_leads:      calls.length,
        ringda:         count(['calling','answered','no_answer','qualified','email_sent','booked','disqualified']),
        besvarade:      count(['answered','qualified','email_sent','booked']),
        kvalificerade:  count(['qualified','email_sent','booked']),
        email_skickade: count(['email_sent','booked']),
        bokade:         count(['booked']),
        inget_svar:     count(['no_answer']),
      })
      setLoading(false)
    })
  }, [])

  const konv = stats.ringda > 0 ? Math.round((stats.bokade / stats.ringda) * 100) : 0
  const statValues: Record<string, number | string> = { ...stats, konv: `${konv}%` }

  function onAgentCreated(a: StlAgent) {
    setAgents(prev => [a, ...prev])
    setShowModal(false)
  }

  async function deleteAgent(id: string, name: string) {
    if (!confirm(`Ta bort agenten "${name}"?`)) return
    await supabase.from('speed_to_lead_agents').delete().eq('id', id)
    setAgents(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="space-y-6 pb-12">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs tracking-widest mb-1" style={{ color: 'var(--brick)' }}>AI & AUTOMATION</p>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
            Speed-to-Lead
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
            Ring varje nytt lead automatiskt inom sekunder — innan konkurrenterna hinner reagera.
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
          style={{ backgroundColor: 'rgba(168,85,247,0.2)', color: 'var(--brick)', border: '1px solid rgba(168,85,247,0.3)' }}>
          ⚡ New Agent
        </button>
      </div>

      {/* ── 8 Stat cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STAT_CONFIG.map(s => (
          <Panel key={s.key} padding="p-4" tiltMaxAngle={4}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">{s.icon}</span>
              <p className="text-[10px] font-semibold tracking-wide uppercase leading-tight" style={{ color: 'var(--slate)' }}>
                {s.label}
              </p>
            </div>
            <p className="text-3xl font-bold tabular-nums" style={{ color: s.color }}>
              {loading ? '—' : statValues[s.key]}
            </p>
          </Panel>
        ))}
      </div>

      {/* ── Agents list or empty state ───────────────────────────────────── */}
      {loading ? (
        <Panel padding="p-6" enableTilt={false}>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--slate)' }}>
            <span className="animate-spin">⟳</span> Laddar agenter…
          </div>
        </Panel>
      ) : agents.length === 0 ? (
        <Panel padding="p-12" className="text-center" enableTilt={false}>
          <p className="text-5xl mb-4">⚡</p>
          <p className="text-xl font-bold mb-2" style={{ color: 'var(--cream)', fontFamily: 'Arial, Helvetica, sans-serif' }}>
            Ring varje nytt lead inom sekunder
          </p>
          <p className="text-sm mb-6 max-w-sm mx-auto" style={{ color: 'var(--slate)' }}>
            Skapa din första Speed-to-Lead-agent och kontakta inkommande leads automatiskt — snabbare än konkurrenterna.
          </p>
          <button onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold"
            style={{ backgroundColor: 'var(--brick)', color: 'var(--cream)' }}>
            ⚡ Skapa första agenten
          </button>
        </Panel>
      ) : (
        <Panel padding="p-0" className="overflow-hidden" enableTilt={false}>
          <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--slate)' }}>
              Agenter ({agents.length})
            </p>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['Agent', 'Företag', 'Röst', 'Frågor', 'Tjänst', 'Skapad', ''].map(col => (
                  <th key={col} className="px-4 py-3 text-left text-[10px] font-semibold tracking-widest uppercase"
                    style={{ color: 'var(--slate)', whiteSpace: 'nowrap' }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map(agent => {
                const voice = VOICES.find(v => v.id === agent.voice_id)
                const date = new Date(agent.created_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
                return (
                  <tr key={agent.id} className="border-b hover:bg-white/[0.02] transition-colors"
                    style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold" style={{ color: 'var(--cream)' }}>{agent.agent_name}</p>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--slate)' }}>{agent.business_name || '—'}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--slate)' }}>
                      {voice ? voice.label.split(' — ')[0] : agent.voice_id || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--slate)' }}>
                      {(agent.qualification_questions || []).length} frågor
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--slate)' }}>
                      {agent.service_requested?.slice(0, 30) || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--slate)' }}>{date}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => deleteAgent(agent.id, agent.agent_name)}
                        className="text-xs px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
                        style={{ color: 'var(--slate)' }}>🗑</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Panel>
      )}

      {/* ── Create Agent Modal ───────────────────────────────────────────── */}
      {showModal && (
        <CreateAgentModal
          onClose={() => setShowModal(false)}
          onCreated={onAgentCreated}
        />
      )}
    </div>
  )
}
