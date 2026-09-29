'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isMissingColumn } from '@/lib/db-errors'

// What the agent's public link is: a sales demo for a prospect, or a paying
// client's own page (agents.client_mode, 029). Shown in both builders — Master
// Demo and Bygg BOS — because both edit the same link, and whoever is in either
// one needs to see which of the two the client is actually looking at.

const MIGRATION_HINT = 'Läget kräver migration 029_bos_client_mode_bookings.sql — kör den i Supabase SQL Editor.'

/** The agent's mode, or null when the column does not exist yet (029 not run). */
export async function loadClientMode(agentId: string): Promise<boolean | null> {
  const { data, error } = await supabase.from('agents').select('client_mode').eq('id', agentId).maybeSingle()
  if (error) return isMissingColumn(error) ? null : false
  return data?.client_mode === true
}

const OPTIONS: { value: boolean; label: string; blurb: string }[] = [
  { value: false, label: 'Säljdemo', blurb: 'För en prospekt: röstdemo, recensionsflöde, audit, förslag och "boka demo".' },
  { value: true, label: 'Klient', blurb: 'Klientens egen sida: bara samtal, kalender och konto. Ingen säljtext.' },
]

export default function ModeSwitch({
  agentId,
  value,
  onChange,
}: {
  agentId: string
  /** Current mode; null = migration 029 has not run. */
  value: boolean | null
  onChange: (clientMode: boolean) => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (value === null) {
    return <p className="text-xs" style={{ color: 'var(--gold)' }}>⚠️ {MIGRATION_HINT}</p>
  }

  async function choose(next: boolean) {
    if (next === value || saving) return
    setSaving(true)
    setError('')
    const { error: e } = await supabase.from('agents').update({ client_mode: next }).eq('id', agentId)
    setSaving(false)
    if (e) { setError(isMissingColumn(e) ? MIGRATION_HINT : e.message); return }
    onChange(next)
  }

  return (
    <div>
      <div role="group" aria-label="Sidans läge" className="inline-flex rounded-xl p-1 gap-1" style={{
        backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
      }}>
        {OPTIONS.map(o => {
          const active = o.value === value
          return (
            <button
              key={o.label}
              type="button"
              aria-pressed={active}
              disabled={saving}
              onClick={() => choose(o.value)}
              className="rounded-lg text-xs font-semibold"
              style={{
                padding: '7px 14px', cursor: saving ? 'wait' : 'pointer',
                backgroundColor: active ? (o.value ? 'rgba(59,130,246,0.25)' : 'rgba(168,85,247,0.22)') : 'transparent',
                color: active ? 'var(--cream)' : 'var(--slate)',
                border: 'none',
              }}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] mt-1.5" style={{ color: 'var(--slate)' }}>
        {saving ? 'Sparar…' : OPTIONS.find(o => o.value === value)?.blurb}
      </p>
      {error && <p className="text-[11px] mt-1" style={{ color: '#ef4444' }}>⚠️ {error}</p>}
    </div>
  )
}
