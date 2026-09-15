'use client'

import { useState, useEffect, useRef } from 'react'
import Panel from '@/app/components/Panel'
import { supabase } from '@/lib/supabase'
import { LEAD_STATUS, COLD_CALL_EXCLUDED_STATUSES } from '@/lib/lead-status'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Lead {
  id: string
  name: string | null
  business: string | null
  phone: string | null
  status: string | null
  ai_score: number | null
}

interface DayStats { calls: number; answered: number; booked: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TODAY = () => new Date().toISOString().slice(0, 10)

function loadDayStats(): DayStats {
  if (typeof window === 'undefined') return { calls: 0, answered: 0, booked: 0 }
  if (localStorage.getItem('cc_date') !== TODAY()) {
    localStorage.setItem('cc_date', TODAY())
    localStorage.removeItem('cc_stats')
  }
  try { return JSON.parse(localStorage.getItem('cc_stats') || '{}') } catch { return { calls: 0, answered: 0, booked: 0 } }
}
function saveDayStats(s: DayStats) { localStorage.setItem('cc_stats', JSON.stringify(s)) }
function fmtTime(s: number) { return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}` }

const DEFAULT_SCRIPT = `Hej [Namn], jag heter [Ditt Namn] och ringer från [Ditt Företag].

Jag hjälper [bransch]-företag i [stad/region] att få fler kunder och boka möten automatiskt med hjälp av AI.

Har du 2 minuter? Jag kan kort berätta hur det fungerar och vad det skulle kunna göra för er.

— Om JA →
"Utmärkt! Vi brukar hjälpa [typ av problem] och resultaten brukar komma redan under de första veckorna.
Kan vi boka ett kort 15-minutersmöte så jag kan visa hur det ser ut för just er?"

— Om NEJ / Inte nu →
"Självklart, jag förstår. Kan jag höra av mig igen om [X veckor] när det passar bättre?"

— Invändning "För dyrt" →
"Jag förstår. Majoriteten av våra kunder sparar mer tid och pengar än vad de betalar inom första månaden. Vill du att jag skickar ett konkret prisexempel?"
`

const STAT_CARDS = [
  { key: 'calls',    label: 'Ringda Idag',   color: 'var(--cream)' },
  { key: 'answered', label: 'Svarade',        color: '#4ade80' },
  { key: 'booked',   label: 'Bokade Möten',   color: 'var(--gold)' },
  { key: 'conv',     label: 'Konvertering',   color: 'var(--brick)' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ColdCallPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Lead | null>(null)
  const [timerRunning, setTimerRunning] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [notes, setNotes] = useState('')
  const [callScript, setCallScript] = useState(DEFAULT_SCRIPT)
  const [editingScript, setEditingScript] = useState(false)
  const [dailyGoal, setDailyGoal] = useState(20)
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput] = useState('20')
  const [stats, setStats] = useState<DayStats>({ calls: 0, answered: 0, booked: 0 })
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = loadDayStats()
    setStats(s)
    const g = parseInt(localStorage.getItem('cc_goal') || '') || 20
    setDailyGoal(g)
    setGoalInput(String(g))
    const sc = localStorage.getItem('cc_script')
    if (sc) setCallScript(sc)

    supabase
      .from('leads')
      .select('id,name,business,phone,status,ai_score')
      .not('status', 'in', `(${COLD_CALL_EXCLUDED_STATUSES.join(',')})`)
      .order('ai_score', { ascending: false, nullsFirst: false })
      .limit(100)
      .then(({ data }) => setLeads((data ?? []) as Lead[]))
  }, [])

  // ── Timer ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timerRunning])

  function selectLead(lead: Lead) {
    setSelected(lead)
    setSeconds(0)
    setTimerRunning(false)
    setNotes('')
  }

  async function logOutcome(outcome: 'answered' | 'no_answer' | 'booked') {
    const next: DayStats = {
      calls: stats.calls + 1,
      answered: (outcome === 'answered' || outcome === 'booked') ? stats.answered + 1 : stats.answered,
      booked: outcome === 'booked' ? stats.booked + 1 : stats.booked,
    }
    setStats(next)
    saveDayStats(next)
    setTimerRunning(false)
    setSeconds(0)

    if (selected) {
      // await, not fire-and-forget: a PostgrestBuilder only sends its request
      // when it is awaited, so neither of these updates ever reached the
      // database — which is why no capitalised status was ever stored.
      if (outcome === 'booked') {
        await supabase.from('leads').update({ status: LEAD_STATUS.MOTE, notes }).eq('id', selected.id)
        setLeads(prev => prev.filter(l => l.id !== selected.id))
      } else if (outcome === 'answered') {
        await supabase.from('leads').update({ status: LEAD_STATUS.KONTAKTAD, notes }).eq('id', selected.id)
        setLeads(prev => prev.map(l => l.id === selected.id ? { ...l, status: LEAD_STATUS.KONTAKTAD } : l))
      }
    }
    setSelected(null)
    setNotes('')
  }

  function saveGoal() {
    const g = parseInt(goalInput) || 20
    setDailyGoal(g)
    localStorage.setItem('cc_goal', String(g))
    setEditingGoal(false)
  }

  function saveScript(text: string) {
    setCallScript(text)
    localStorage.setItem('cc_script', text)
    setEditingScript(false)
  }

  const filtered = leads.filter(l => {
    const q = search.toLowerCase()
    return !q || l.name?.toLowerCase().includes(q) || l.business?.toLowerCase().includes(q)
  })

  const conv = stats.calls > 0 ? Math.round((stats.booked / stats.calls) * 100) : 0
  const statValues: Record<string, string | number> = {
    calls: stats.calls, answered: stats.answered, booked: stats.booked, conv: `${conv}%`
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

  return (
    <div className="space-y-5 pb-12">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs tracking-widest mb-1" style={{ color: 'var(--brick)' }}>SÄLJPIPELINE</p>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
            Cold Call Station
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--slate)' }}>Dagligt mål:</span>
          {editingGoal ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={goalInput}
                onChange={e => setGoalInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditingGoal(false) }}
                className="w-16 text-center rounded-lg text-sm font-bold"
                style={{ ...inputStyle, padding: '4px 8px', width: '4rem' }}
                autoFocus
              />
              <button onClick={saveGoal} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--brick)', color: 'var(--cream)' }}>OK</button>
            </div>
          ) : (
            <button onClick={() => { setEditingGoal(true); setGoalInput(String(dailyGoal)) }}
              className="text-sm font-bold px-3 py-1 rounded-lg transition-all"
              style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: 'var(--brick)', border: '1px solid rgba(168,85,247,0.25)' }}>
              {dailyGoal} samtal
            </button>
          )}
        </div>
      </div>

      {/* ── Stat cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STAT_CARDS.map(card => (
          <Panel key={card.key} padding="p-4" tiltMaxAngle={4}>
            <p className="text-xs font-semibold tracking-wide uppercase mb-2" style={{ color: 'var(--slate)' }}>{card.label}</p>
            <p className="text-3xl font-bold" style={{ color: card.color }}>{statValues[card.key]}</p>
            {card.key === 'calls' && (
              <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (stats.calls / dailyGoal) * 100)}%`, backgroundColor: 'var(--brick)' }} />
              </div>
            )}
          </Panel>
        ))}
      </div>

      {/* ── Three panels ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_300px] gap-4">

        {/* Panel 1: Lead Queue */}
        <Panel padding="p-0" className="flex flex-col overflow-hidden" enableTilt={false} style={{ maxHeight: '600px' }}>
          <div className="p-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--slate)' }}>Välj Lead</p>
            <input
              type="text"
              placeholder="Sök lead…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-center py-8" style={{ color: 'var(--slate)' }}>Inga leads hittades</p>
            ) : filtered.map(lead => (
              <button key={lead.id} onClick={() => selectLead(lead)}
                className="w-full text-left px-4 py-3 border-b transition-colors"
                style={{
                  borderColor: 'rgba(255,255,255,0.06)',
                  backgroundColor: selected?.id === lead.id ? 'rgba(168,85,247,0.15)' : 'transparent',
                }}>
                <p className="text-sm font-semibold leading-tight" style={{ color: selected?.id === lead.id ? 'var(--brick)' : 'var(--cream)' }}>
                  {lead.name || '—'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{lead.business || '—'}</p>
                {lead.phone && <p className="text-[10px] mt-0.5" style={{ color: 'var(--slate)' }}>{lead.phone}</p>}
                {lead.ai_score != null && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block"
                    style={{ backgroundColor: 'rgba(201,162,75,0.15)', color: 'var(--gold)' }}>
                    {lead.ai_score}/100
                  </span>
                )}
              </button>
            ))}
          </div>
        </Panel>

        {/* Panel 2: Timer + Active Call */}
        <Panel padding="p-6" className="flex flex-col gap-5" enableTilt={false}>
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-12">
              <p className="text-5xl">📞</p>
              <p className="font-semibold" style={{ color: 'var(--cream)' }}>Välj ett lead till vänster</p>
              <p className="text-sm" style={{ color: 'var(--slate)' }}>Klicka på ett lead för att börja ringa</p>
            </div>
          ) : (
            <>
              {/* Lead info */}
              <div className="border-b pb-4" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                <p className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: 'var(--brick)' }}>RINGER</p>
                <h2 className="text-xl font-bold" style={{ color: 'var(--cream)' }}>{selected.name}</h2>
                <p className="text-sm" style={{ color: 'var(--slate)' }}>{selected.business}</p>
                {selected.phone && (
                  <a href={`tel:${selected.phone}`} className="text-sm font-mono mt-1 inline-block hover:underline"
                    style={{ color: 'var(--brick)' }}>
                    {selected.phone}
                  </a>
                )}
              </div>

              {/* Timer */}
              <div className="flex flex-col items-center gap-4">
                <div className="text-6xl font-mono font-bold tabular-nums" style={{ color: timerRunning ? '#4ade80' : 'var(--cream)' }}>
                  {fmtTime(seconds)}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setTimerRunning(r => !r)}
                    className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                    style={{ backgroundColor: timerRunning ? 'rgba(255,255,255,0.08)' : 'rgba(74,222,128,0.15)', color: timerRunning ? 'var(--slate)' : '#4ade80', border: `1px solid ${timerRunning ? 'rgba(255,255,255,0.1)' : 'rgba(74,222,128,0.3)'}` }}>
                    {timerRunning ? '⏸ Pausa' : '▶ Starta'}
                  </button>
                  <button onClick={() => { setSeconds(0); setTimerRunning(false) }}
                    className="px-3 py-2 rounded-lg text-sm transition-all"
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--slate)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    ↺
                  </button>
                </div>
              </div>

              {/* Outcome buttons */}
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => logOutcome('answered')}
                  className="py-2.5 rounded-xl text-xs font-bold transition-all"
                  style={{ backgroundColor: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.25)' }}>
                  ✓ Svarade
                </button>
                <button onClick={() => logOutcome('no_answer')}
                  className="py-2.5 rounded-xl text-xs font-bold transition-all"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--slate)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  ✗ Inget svar
                </button>
                <button onClick={() => logOutcome('booked')}
                  className="py-2.5 rounded-xl text-xs font-bold transition-all"
                  style={{ backgroundColor: 'rgba(201,162,75,0.15)', color: 'var(--gold)', border: '1px solid rgba(201,162,75,0.3)' }}>
                  📅 Boka möte
                </button>
              </div>

              <button onClick={() => { setSelected(null); setTimerRunning(false); setSeconds(0) }}
                className="text-xs text-center"
                style={{ color: 'var(--slate)' }}>
                ← Avbryt, välj annat lead
              </button>
            </>
          )}
        </Panel>

        {/* Panel 3: Notes + Call Script */}
        <Panel padding="p-0" className="flex flex-col overflow-hidden" enableTilt={false} style={{ maxHeight: '600px' }}>
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Notes */}
            <div className="p-4 border-b flex-1 flex flex-col" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--slate)' }}>Anteckningar</p>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={selected ? `Anteckna om samtalet med ${selected.name}…` : 'Välj ett lead för att börja…'}
                disabled={!selected}
                rows={5}
                className="flex-1 resize-none outline-none w-full text-sm disabled:opacity-40"
                style={{ background: 'transparent', color: 'var(--cream)', fontFamily: 'inherit' }}
              />
            </div>

            {/* Call Script */}
            <div className="p-4 flex flex-col flex-1 overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--slate)' }}>Call Script</p>
                <button onClick={() => setEditingScript(e => !e)}
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: 'var(--brick)' }}>
                  {editingScript ? 'Spara' : 'Redigera'}
                </button>
              </div>
              {editingScript ? (
                <textarea
                  value={callScript}
                  onChange={e => setCallScript(e.target.value)}
                  onBlur={() => saveScript(callScript)}
                  rows={12}
                  className="flex-1 resize-none outline-none w-full text-xs overflow-y-auto"
                  style={{ background: 'transparent', color: 'var(--cream)', fontFamily: 'monospace' }}
                />
              ) : (
                <div className="overflow-y-auto flex-1">
                  <pre className="text-xs whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--slate)', fontFamily: 'inherit' }}>
                    {callScript}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
