'use client'

import { useState, useEffect } from 'react'
import Dropdown from '@/app/components/Dropdown'
import { supabase } from '@/lib/supabase'

// Optional "link this to an AI agent" selector.
//
// Review Automation and the AI Audit Maker are standalone tools with no agent
// context, so everything created there used to land with agent_id = null and
// never showed up in the agent's Master Demo. This lets the user attach the row
// to an agent at creation time; leaving it blank keeps the old behaviour.

interface AgentOption {
  id: string
  name: string
  business_name: string | null
  lead_id: string | null
}

export default function AgentPicker({
  value,
  onChange,
  label = 'Koppla till AI-agent',
  hint = 'Valfritt — kopplas den till en agent dyker den upp i agentens Master Demo.',
}: {
  value: string
  /** agentId is '' when nothing is selected. */
  onChange: (agentId: string, leadId: string | null) => void
  label?: string
  hint?: string
}) {
  const [agents, setAgents] = useState<AgentOption[]>([])

  useEffect(() => {
    supabase
      .from('agents')
      .select('id, name, business_name, lead_id')
      .order('created_at', { ascending: false })
      .then(({ data }) => setAgents(data ?? []))
  }, [])

  if (agents.length === 0) return null

  const options = [
    { value: '', label: 'Ingen agent' },
    ...agents.map(a => ({ value: a.id, label: a.business_name || a.name })),
  ]

  return (
    <div>
      <label className="block text-xs mb-1.5" style={{ color: 'var(--slate)' }}>{label}</label>
      <Dropdown
        value={value}
        onChange={id => onChange(id, agents.find(a => a.id === id)?.lead_id ?? null)}
        options={options}
        placeholder="Ingen agent"
        style={{ width: '100%' }}
      />
      <p className="text-[11px] mt-1.5" style={{ color: 'var(--slate)' }}>{hint}</p>
    </div>
  )
}
