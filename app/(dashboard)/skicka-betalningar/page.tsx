'use client'

import { useState, useEffect } from 'react'
import Panel from '@/app/components/Panel'
import Dropdown from '@/app/components/Dropdown'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Agent {
  id: string
  name: string
  business_name: string | null
  intelligence_tier: string | null
}

interface Invoice {
  id: string
  agent_id: string | null
  client_name: string
  amount: number
  description: string | null
  status: string
  created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const TIER_PRICING: Record<string, { label: string; costPerMin: number; monthlyBase: number }> = {
  standard: { label: 'Standard',  costPerMin: 0.15, monthlyBase: 299 },
  advanced: { label: 'Advanced',  costPerMin: 0.22, monthlyBase: 499 },
  premium:  { label: 'Premium',   costPerMin: 0.32, monthlyBase: 799 },
}

const PROVIDERS = [
  { name: 'Stripe',  icon: '💳', color: '#635BFF', desc: 'Kort & direktbetalning' },
  { name: 'PayPal',  icon: '🅿️', color: '#009CDE', desc: 'PayPal & Venmo' },
  { name: 'Whop',    icon: '⚡', color: '#7C3AED', desc: 'Digital produktförsäljning' },
]

const INVOICE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  sent:      { label: 'Skickad',   color: 'var(--gold)',  bg: 'rgba(201,162,75,0.12)' },
  paid:      { label: 'Betald',    color: '#4ade80',      bg: 'rgba(74,222,128,0.12)' },
  overdue:   { label: 'Försenad', color: 'var(--brick)',  bg: 'rgba(168,85,247,0.12)' },
  cancelled: { label: 'Avbruten', color: 'var(--slate)',  bg: 'rgba(255,255,255,0.06)' },
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

type Tab = 'calculator' | 'invoice' | 'history'

// ─── Profit Calculator ─────────────────────────────────────────────────────────
function ProfitCalculator({ agents }: { agents: Agent[] }) {
  const [agentId, setAgentId] = useState('')
  const [clientCharge, setClientCharge] = useState('1499')
  const [minutes, setMinutes] = useState('200')
  const [phoneNumbers, setPhoneNumbers] = useState('1')

  const agent = agents.find(a => a.id === agentId)
  const tier = agent?.intelligence_tier ?? 'standard'
  const pricing = TIER_PRICING[tier] ?? TIER_PRICING.standard

  const charge   = Number(clientCharge) || 0
  const mins     = Number(minutes) || 0
  const phones   = Number(phoneNumbers) || 0
  const callCost = mins * pricing.costPerMin
  const phoneCost = phones * 20
  const totalCost = pricing.monthlyBase + callCost + phoneCost
  const profit   = charge - totalCost
  const margin   = charge > 0 ? Math.round((profit / charge) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Inputs */}
      <Panel padding="p-5" enableTilt={false}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--cream)' }}>Konfiguration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Select Agent</label>
            <Dropdown
              value={agentId}
              onChange={setAgentId}
              placeholder="— Välj agent —"
              style={inputStyle}
              options={agents.map(a => {
                const t = TIER_PRICING[a.intelligence_tier ?? 'standard'] ?? TIER_PRICING.standard
                return {
                  value: a.id,
                  label: `${a.name}${a.business_name ? ` — ${a.business_name}` : ''} (${t.label}, ${t.monthlyBase} kr/mån)`,
                }
              })}
            />
            {agent && (
              <p className="text-xs mt-1" style={{ color: 'var(--gold)' }}>
                {(TIER_PRICING[tier] ?? TIER_PRICING.standard).label}-tier · {(TIER_PRICING[tier] ?? TIER_PRICING.standard).costPerMin} kr/min
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Du tar betalt av klient (kr/mån)</label>
            <input type="number" min={0} style={inputStyle} value={clientCharge} onChange={e => setClientCharge(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Uppskattade samtalsminuter/mån</label>
            <input type="number" min={0} style={inputStyle} value={minutes} onChange={e => setMinutes(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Telefonnummer (antal × 20 kr)</label>
            <input type="number" min={0} max={10} style={inputStyle} value={phoneNumbers} onChange={e => setPhoneNumbers(e.target.value)} />
          </div>
        </div>
      </Panel>

      {/* Cost breakdown */}
      <Panel padding="p-5" enableTilt={false}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--cream)' }}>Your Costs</h3>
        <div className="space-y-2 text-sm">
          {[
            [`AI-agent (${(TIER_PRICING[tier] ?? TIER_PRICING.standard).label}-tier)`, `${pricing.monthlyBase.toLocaleString('sv-SE')} kr`],
            [`Samtalsminuter (${mins} min × ${pricing.costPerMin} kr)`, `${callCost.toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kr`],
            [`Telefonnummer (${phones} × 20 kr)`, `${phoneCost} kr`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between items-center">
              <span style={{ color: 'var(--slate)' }}>{label}</span>
              <span style={{ color: 'var(--cream)' }}>{value}</span>
            </div>
          ))}
          <div className="flex justify-between items-center pt-2 font-semibold" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ color: 'var(--cream)' }}>Total kostnad</span>
            <span style={{ color: 'var(--brick)' }}>{totalCost.toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} kr</span>
          </div>
        </div>
      </Panel>

      {/* Result cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: 'Du Tar Betalt', value: `${charge.toLocaleString('sv-SE')} kr`, sub: 'per månad', color: 'var(--cream)' },
          { label: 'Din Kostnad',   value: `${totalCost.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr`, sub: 'per månad', color: 'var(--brick)' },
          { label: 'Din Vinst',     value: `${profit.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr`, sub: `${margin}% marginal`, color: profit >= 0 ? '#4ade80' : 'var(--brick)' },
        ].map(({ label, value, sub, color }) => (
          <Panel key={label} padding="p-5" tiltMaxAngle={4}>
            <p className="text-xs mb-2" style={{ color: 'var(--slate)' }}>{label}</p>
            <p className="text-2xl font-bold" style={{ color }}>{value}</p>
            <p className="text-xs mt-1" style={{ color: profit < 0 && label === 'Din Vinst' ? 'var(--brick)' : 'rgba(255,255,255,0.3)' }}>
              {sub}
            </p>
          </Panel>
        ))}
      </div>
    </div>
  )
}

// ─── Send Invoice ──────────────────────────────────────────────────────────────
function SendInvoice({ agents, onSent }: { agents: Agent[]; onSent: (inv: Invoice) => void }) {
  const [agentId, setAgentId] = useState('')
  const [clientName, setClientName] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSend() {
    if (!clientName.trim() || !amount) { setError('Kund och belopp krävs'); return }
    setSending(true)
    setError('')
    const { data, error: e } = await supabase
      .from('invoices')
      .insert({
        agent_id: agentId || null,
        client_name: clientName.trim(),
        amount: Number(amount),
        description: description.trim() || null,
        status: 'sent',
      })
      .select()
      .single()
    setSending(false)
    if (e || !data) { setError(e?.message ?? 'Fel'); return }
    setSuccess(true)
    onSent(data)
    setTimeout(() => {
      setSuccess(false)
      setClientName('')
      setAmount('')
      setDescription('')
      setAgentId('')
    }, 2000)
  }

  return (
    <Panel padding="p-6" enableTilt={false}>
      <h3 className="text-sm font-semibold mb-5" style={{ color: 'var(--cream)' }}>Skicka faktura</h3>

      {/* Provider notice */}
      <div className="mb-5 p-3 rounded-lg text-sm" style={{ background: 'rgba(201,162,75,0.08)', border: '1px solid rgba(201,162,75,0.2)' }}>
        <p style={{ color: 'var(--gold)' }}>⚠ Ingen betalningsleverantör kopplad ännu</p>
        <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Koppla Stripe, PayPal eller Whop ovan för att aktivera riktig betalning. Fakturan sparas lokalt tills vidare.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Agent (valfritt)</label>
          <Dropdown
            value={agentId}
            onChange={setAgentId}
            placeholder="— Koppla till agent —"
            style={inputStyle}
            options={agents.map(a => ({ value: a.id, label: `${a.name}${a.business_name ? ` — ${a.business_name}` : ''}` }))}
          />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Kund *</label>
          <input style={inputStyle} value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Ex. Rörmokarna AB" />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Belopp (kr) *</label>
          <input type="number" min={0} style={inputStyle} value={amount} onChange={e => setAmount(e.target.value)} placeholder="Ex. 1499" />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Beskrivning</label>
          <textarea
            style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="AI-receptionist — månadslicens"
          />
        </div>
      </div>

      {error && <p className="text-sm mt-3" style={{ color: 'var(--brick)' }}>{error}</p>}

      <button
        onClick={handleSend}
        disabled={sending || success}
        className="mt-5 w-full py-3 rounded-lg text-sm font-semibold transition-all"
        style={{
          background: success ? 'rgba(74,222,128,0.2)' : 'var(--brick)',
          color: success ? '#4ade80' : 'white',
          border: success ? '1px solid rgba(74,222,128,0.4)' : 'none',
          opacity: sending ? 0.6 : 1,
        }}
      >
        {success ? '✓ Faktura sparad' : sending ? 'Sparar...' : '📤 Skicka faktura'}
      </button>
    </Panel>
  )
}

// ─── History ───────────────────────────────────────────────────────────────────
function History({ invoices }: { invoices: Invoice[] }) {
  if (invoices.length === 0) {
    return (
      <Panel className="text-center py-16" enableTilt={false}>
        <div className="text-4xl mb-4">📭</div>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--cream)' }}>Inga fakturor än</h3>
        <p className="text-sm" style={{ color: 'var(--slate)' }}>
          Skicka din första faktura via Send Invoice-fliken.
        </p>
      </Panel>
    )
  }

  return (
    <Panel padding="p-0" className="overflow-hidden" enableTilt={false}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {['Kund', 'Belopp', 'Beskrivning', 'Status', 'Datum'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium" style={{ color: 'var(--slate)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv, i) => {
              const st = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.sent
              return (
                <tr key={inv.id} style={{ borderBottom: i < invoices.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--cream)' }}>{inv.client_name}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--gold)' }}>{Number(inv.amount).toLocaleString('sv-SE')} kr</td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--slate)' }}>{inv.description ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--slate)' }}>
                    {new Date(inv.created_at).toLocaleDateString('sv-SE')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function SkickaBetalningarPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('calculator')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: agentsData }, { data: invoicesData }] = await Promise.all([
        supabase.from('agents').select('id, name, business_name, intelligence_tier').order('created_at', { ascending: false }),
        supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(100),
      ])
      setAgents(agentsData ?? [])
      setInvoices(invoicesData ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'calculator', label: 'Profit Calculator' },
    { id: 'invoice',    label: 'Send Invoice' },
    { id: 'history',   label: 'History' },
  ]

  return (
    <div>
      {/* Header */}
      <Panel padding="px-5 py-3" className="inline-block mb-6" enableTilt={false}>
        <p className="text-xs tracking-widest" style={{ color: 'var(--brick)' }}>AFFÄR</p>
        <h1 className="text-3xl font-bold mt-1" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
          💸 Skicka Betalningar
        </h1>
      </Panel>

      {/* Payment providers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {PROVIDERS.map(p => (
          <Panel key={p.name} padding="p-4" className="flex items-center justify-between gap-4" enableTilt={false}>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
                style={{ background: `${p.color}18`, border: `1px solid ${p.color}30` }}
              >
                {p.icon}
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--cream)' }}>{p.name}</p>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>{p.desc}</p>
              </div>
            </div>
            <button
              className="px-3 py-1.5 rounded-lg text-xs font-medium shrink-0"
              style={{ background: `${p.color}18`, color: p.color, border: `1px solid ${p.color}35` }}
              onClick={() => alert(`${p.name} OAuth-koppling kommer snart.`)}
            >
              Koppla
            </button>
          </Panel>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl inline-flex" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: activeTab === t.id ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: activeTab === t.id ? 'var(--cream)' : 'var(--slate)',
              border: activeTab === t.id ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {loading ? (
        <Panel enableTilt={false}><p style={{ color: 'var(--slate)' }}>Laddar...</p></Panel>
      ) : activeTab === 'calculator' ? (
        <ProfitCalculator agents={agents} />
      ) : activeTab === 'invoice' ? (
        <SendInvoice agents={agents} onSent={inv => setInvoices(prev => [inv, ...prev])} />
      ) : (
        <History invoices={invoices} />
      )}
    </div>
  )
}
