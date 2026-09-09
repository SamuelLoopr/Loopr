'use client'

import { useState, useEffect } from 'react'
import Panel from '@/app/components/Panel'
import Dropdown from '@/app/components/Dropdown'
import AgentPicker from '@/app/components/AgentPicker'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ReviewClient {
  id: string
  business_name: string
  google_review_url: string
  delay_minutes: number
  message_template: string
  share_id: string
  demo_generated_at: string | null
  created_at: string
  sent_this_month?: number
  agent_id?: string | null
  lead_id?: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DELAYS = [
  { value: 15,  label: '15 min efter möte' },
  { value: 30,  label: '30 min efter möte' },
  { value: 60,  label: '60 min efter möte' },
  { value: 120, label: '120 min efter möte' },
]

const DEFAULT_TEMPLATE =
  'Hej {{kund_namn}}, tack för att du valde {{företag}}! Vi skulle uppskatta en snabb recension på Google: {{review_url}}'

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

function genShareId() {
  return Math.random().toString(36).substring(2, 10)
}

// ─── Client Modal (Add & Edit) ─────────────────────────────────────────────────
function ClientModal({
  initial,
  onClose,
  onSaved,
}: {
  initial?: ReviewClient
  onClose: () => void
  onSaved: (c: ReviewClient) => void
}) {
  const isEdit = !!initial
  const [step, setStep] = useState(1)
  const [businessName, setBusinessName] = useState(initial?.business_name ?? '')
  const [googleUrl, setGoogleUrl] = useState(initial?.google_review_url ?? '')
  const [delay, setDelay] = useState(initial?.delay_minutes ?? 30)
  const [template, setTemplate] = useState(initial?.message_template ?? DEFAULT_TEMPLATE)
  const [agentId, setAgentId] = useState(initial?.agent_id ?? '')
  const [leadId, setLeadId] = useState<string | null>(initial?.lead_id ?? null)
  const [urlError, setUrlError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  function validateUrl(url: string) {
    if (!url.trim()) return 'Google Recensions-URL krävs'
    if (!url.startsWith('https://g.page') && !url.startsWith('https://search.google.com')) {
      return 'URL måste börja med https://g.page eller https://search.google.com'
    }
    return ''
  }

  async function handleSave() {
    if (!businessName.trim()) { setSaveError('Företagsnamn krävs'); return }
    const err = validateUrl(googleUrl)
    if (err) { setSaveError(err); return }
    setSaving(true)
    setSaveError('')

    if (isEdit) {
      const { data, error: e } = await supabase
        .from('review_clients')
        .update({ business_name: businessName, google_review_url: googleUrl, delay_minutes: delay, message_template: template, agent_id: agentId || null, lead_id: leadId })
        .eq('id', initial!.id)
        .select()
        .single()
      setSaving(false)
      if (e || !data) { setSaveError(e?.message ?? 'Fel vid sparning'); return }
      onSaved({ ...initial!, ...data })
    } else {
      const shareId = genShareId()
      const { data, error: e } = await supabase
        .from('review_clients')
        .insert({
          business_name: businessName,
          google_review_url: googleUrl,
          delay_minutes: delay,
          message_template: template,
          share_id: shareId,
          demo_generated_at: new Date().toISOString(),
          agent_id: agentId || null,
          lead_id: leadId,
        })
        .select()
        .single()
      setSaving(false)
      if (e || !data) { setSaveError(e?.message ?? 'Fel vid sparning'); return }
      onSaved(data)
    }
  }

  const btnPrimary: React.CSSProperties = { backgroundColor: 'var(--brick)', color: 'white' }
  const btnGhost: React.CSSProperties = { color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }

  const stepContent: Record<number, React.ReactNode> = {
    1: (
      <>
        <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--cream)' }}>
          Steg 1: Företagsinformation
        </h2>
        <div className="mb-4">
          <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Företagsnamn</label>
          <input
            style={inputStyle}
            value={businessName}
            onChange={e => setBusinessName(e.target.value)}
            placeholder="Ex. Rörmokarna VVS AB"
          />
        </div>
        <div className="mb-4">
          <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Google Recensions-URL</label>
          <input
            style={inputStyle}
            value={googleUrl}
            onChange={e => { setGoogleUrl(e.target.value); setUrlError('') }}
            placeholder="https://g.page/r/..."
          />
          {urlError && <p className="text-xs mt-1" style={{ color: 'var(--brick)' }}>{urlError}</p>}
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Måste börja med https://g.page eller https://search.google.com
          </p>
        </div>
        <div className="mb-4">
          <AgentPicker value={agentId} onChange={(a, l) => { setAgentId(a); setLeadId(l) }} />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button style={btnGhost} onClick={onClose}>Avbryt</button>
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={btnPrimary}
            onClick={() => {
              const err = validateUrl(googleUrl)
              setUrlError(err)
              if (!err && businessName.trim()) setStep(2)
            }}
          >
            Nästa →
          </button>
        </div>
      </>
    ),
    2: (
      <>
        <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--cream)' }}>Steg 2: Dröjsmål</h2>
        <div className="mb-4">
          <label className="block text-xs mb-2" style={{ color: 'var(--slate)' }}>Skicka SMS efter avslutat jobb</label>
          <Dropdown
            value={String(delay)}
            onChange={v => setDelay(Number(v))}
            style={inputStyle}
            options={DELAYS.map(d => ({ value: String(d.value), label: d.label }))}
          />
        </div>
        <div className="flex justify-between mt-6">
          <button style={btnGhost} onClick={() => setStep(1)}>← Tillbaka</button>
          <button className="px-4 py-2 rounded-lg text-sm font-medium" style={btnPrimary} onClick={() => setStep(3)}>Nästa →</button>
        </div>
      </>
    ),
    3: (
      <>
        <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--cream)' }}>Steg 3: Meddelandemall</h2>
        <div className="mb-2">
          <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>SMS-meddelande</label>
          <textarea
            style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
            value={template}
            onChange={e => setTemplate(e.target.value)}
          />
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {'Variabler: {{kund_namn}}  {{företag}}  {{review_url}}'}
          </p>
        </div>
        <div className="flex justify-between mt-6">
          <button style={btnGhost} onClick={() => setStep(2)}>← Tillbaka</button>
          <button className="px-4 py-2 rounded-lg text-sm font-medium" style={btnPrimary} onClick={() => setStep(4)}>Nästa →</button>
        </div>
      </>
    ),
    4: (
      <>
        <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--cream)' }}>Steg 4: Sammanfattning</h2>
        <Panel padding="p-4" className="mb-4" enableTilt={false}>
          <dl className="space-y-2 text-sm">
            {([
              ['Företag', businessName],
              ['Google URL', googleUrl],
              ['Dröjsmål', DELAYS.find(d => d.value === delay)?.label ?? ''],
              ['Mall', template],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <dt className="text-xs" style={{ color: 'var(--slate)' }}>{label}</dt>
                <dd style={{ color: 'var(--cream)', wordBreak: 'break-word' }}>{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        {saveError && <p className="text-sm mb-3" style={{ color: 'var(--brick)' }}>{saveError}</p>}
        <div className="flex justify-between mt-4">
          <button style={btnGhost} onClick={() => setStep(3)}>← Tillbaka</button>
          <button
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? 'Sparar...' : 'Skapa klient'}
          </button>
        </div>
      </>
    ),
  }

  // Edit mode: single-panel form
  if (isEdit) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
        <div className="w-full max-w-lg mx-4 max-h-screen overflow-y-auto py-8">
          <Panel enableTilt={false}>
            <h2 className="text-lg font-semibold mb-5" style={{ color: 'var(--cream)' }}>Redigera klient</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Företagsnamn</label>
                <input style={inputStyle} value={businessName} onChange={e => setBusinessName(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Google Recensions-URL</label>
                <input style={inputStyle} value={googleUrl} onChange={e => { setGoogleUrl(e.target.value); setUrlError('') }} />
                {urlError && <p className="text-xs mt-1" style={{ color: 'var(--brick)' }}>{urlError}</p>}
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Dröjsmål</label>
                <Dropdown
                  value={String(delay)}
                  onChange={v => setDelay(Number(v))}
                  style={inputStyle}
                  options={DELAYS.map(d => ({ value: String(d.value), label: d.label }))}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--slate)' }}>Meddelandemall</label>
                <textarea
                  style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                  value={template}
                  onChange={e => setTemplate(e.target.value)}
                />
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {'Variabler: {{kund_namn}}  {{företag}}  {{review_url}}'}
                </p>
              </div>
            </div>
            {saveError && <p className="text-sm mt-3" style={{ color: 'var(--brick)' }}>{saveError}</p>}
            <div className="flex justify-end gap-3 mt-6">
              <button style={btnGhost} onClick={onClose}>Avbryt</button>
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? 'Sparar...' : 'Spara ändringar'}
              </button>
            </div>
          </Panel>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg mx-4 max-h-screen overflow-y-auto py-8">
        <Panel enableTilt={false}>
          {/* Step progress bar */}
          <div className="flex gap-1 mb-6">
            {[1, 2, 3, 4].map(n => (
              <div
                key={n}
                className="h-1 flex-1 rounded-full transition-all"
                style={{ backgroundColor: step >= n ? 'var(--brick)' : 'rgba(255,255,255,0.1)' }}
              />
            ))}
          </div>
          {stepContent[step]}
        </Panel>
      </div>
    </div>
  )
}

// ─── Client Card ───────────────────────────────────────────────────────────────
function ClientCard({
  client,
  onManage,
  onRegenerate,
  regenerating,
}: {
  client: ReviewClient
  onManage: () => void
  onRegenerate: () => void
  regenerating: boolean
}) {
  return (
    <Panel className="flex flex-col gap-3 h-full" tiltMaxAngle={6}>
      <div>
        <h3 className="text-base font-semibold" style={{ color: 'var(--cream)' }}>{client.business_name}</h3>
        <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Delay: {client.delay_minutes} min efter möte</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <span
          className="px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: 'rgba(61,74,74,0.5)', color: 'var(--slate)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          manual
        </span>
        <span
          className="px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: 'rgba(201,162,75,0.12)', color: 'var(--gold)', border: '1px solid rgba(201,162,75,0.3)' }}
        >
          Twilio ready
        </span>
      </div>

      <p className="text-sm" style={{ color: 'var(--slate)' }}>
        <span className="font-semibold" style={{ color: 'var(--cream)' }}>{client.sent_this_month ?? 0}</span> skickade denna månad
      </p>

      {client.demo_generated_at && (
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.28)' }}>
          Generated {new Date(client.demo_generated_at).toLocaleDateString('sv-SE')}
        </p>
      )}

      <div className="flex gap-2 flex-wrap mt-auto pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          onClick={onManage}
          className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ backgroundColor: 'rgba(255,255,255,0.07)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          Manage
        </button>
        <a
          href={`/demo/${client.share_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{
            backgroundColor: 'rgba(201,162,75,0.12)',
            color: 'var(--gold)',
            border: '1px solid rgba(201,162,75,0.3)',
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          View Demo ↗
        </a>
        <button
          onClick={onRegenerate}
          disabled={regenerating}
          className="px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{
            backgroundColor: 'rgba(168,85,247,0.12)',
            color: 'var(--brick)',
            border: '1px solid rgba(168,85,247,0.3)',
            opacity: regenerating ? 0.6 : 1,
          }}
        >
          {regenerating ? '...' : '↻ Regenerate'}
        </button>
      </div>
    </Panel>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ReviewAutomationPage() {
  const [clients, setClients] = useState<ReviewClient[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editClient, setEditClient] = useState<ReviewClient | null>(null)
  const [regenerating, setRegenerating] = useState<string | null>(null)

  useEffect(() => { loadClients() }, [])

  async function loadClients() {
    setLoading(true)
    const { data: clientsData } = await supabase
      .from('review_clients')
      .select('*')
      .order('created_at', { ascending: false })

    if (!clientsData) { setLoading(false); return }

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const { data: reqData } = await supabase
      .from('review_requests')
      .select('client_id')
      .gte('created_at', monthStart)

    const countMap: Record<string, number> = {}
    for (const r of (reqData ?? [])) {
      countMap[r.client_id] = (countMap[r.client_id] ?? 0) + 1
    }

    setClients(clientsData.map(c => ({ ...c, sent_this_month: countMap[c.id] ?? 0 })))
    setLoading(false)
  }

  async function handleRegenerate(client: ReviewClient) {
    setRegenerating(client.id)
    const newShareId = genShareId()
    const { data } = await supabase
      .from('review_clients')
      .update({ share_id: newShareId, demo_generated_at: new Date().toISOString() })
      .eq('id', client.id)
      .select()
      .single()
    setRegenerating(null)
    if (data) {
      setClients(prev =>
        prev.map(c => c.id === client.id ? { ...c, share_id: data.share_id, demo_generated_at: data.demo_generated_at } : c)
      )
    }
  }

  function handleClientSaved(c: ReviewClient) {
    setClients(prev => {
      const idx = prev.findIndex(x => x.id === c.id)
      if (idx >= 0) return prev.map(x => x.id === c.id ? { ...x, ...c } : x)
      return [{ ...c, sent_this_month: 0 }, ...prev]
    })
    setShowAdd(false)
    setEditClient(null)
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <Panel padding="px-5 py-3" className="inline-block" enableTilt={false}>
          <p className="text-xs tracking-widest" style={{ color: 'var(--brick)' }}>AI & AUTOMATION</p>
          <h1
            className="text-3xl font-bold mt-1"
            style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}
          >
            ⭐ Recensionsautomation
          </h1>
        </Panel>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ backgroundColor: 'var(--brick)', color: 'white' }}
        >
          + Lägg till klient
        </button>
      </div>

      {loading && (
        <Panel enableTilt={false}><p style={{ color: 'var(--slate)' }}>Laddar klienter...</p></Panel>
      )}

      {!loading && clients.length === 0 && (
        <Panel className="text-center py-16" enableTilt={false}>
          <div className="text-5xl mb-4">⭐</div>
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--cream)' }}>Inga klienter ännu</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>
            Lägg till din första klient för att börja automatisera Google-recensioner via SMS.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="px-5 py-2 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'var(--brick)', color: 'white' }}
          >
            + Lägg till klient
          </button>
        </Panel>
      )}

      {!loading && clients.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {clients.map(client => (
            <ClientCard
              key={client.id}
              client={client}
              onManage={() => setEditClient(client)}
              onRegenerate={() => handleRegenerate(client)}
              regenerating={regenerating === client.id}
            />
          ))}
        </div>
      )}

      {showAdd && <ClientModal onClose={() => setShowAdd(false)} onSaved={handleClientSaved} />}
      {editClient && (
        <ClientModal initial={editClient} onClose={() => setEditClient(null)} onSaved={handleClientSaved} />
      )}
    </div>
  )
}
