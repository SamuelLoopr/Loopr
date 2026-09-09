'use client'

import { useState, useEffect } from 'react'
import Panel from '@/app/components/Panel'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface MinuteTransaction {
  id: string
  type: string
  description: string | null
  amount: number
  balance_after: number | null
  created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const LOW_BALANCE_THRESHOLD = 20
const FREE_MONTHLY_MINUTES = 5

const USAGE_TYPES = [
  { icon: '📞', label: 'AI Receptionists' },
  { icon: '📤', label: 'Outbound Receptionists' },
  { icon: '🔮', label: 'Framtida röstagenter' },
]

interface Package {
  id: string
  name: string
  minutes: number
  price: number
  badge: string | null
  highlight?: boolean
}

const PACKAGES: Package[] = [
  { id: 'trial',   name: 'Trial',   minutes: 10,   price: 10,   badge: null },
  { id: 'starter', name: 'Starter', minutes: 100,  price: 100,  badge: 'Spara 5%' },
  { id: 'growth',  name: 'Growth',  minutes: 500,  price: 470,  badge: 'Populärast', highlight: true },
  { id: 'scale',   name: 'Scale',   minutes: 1500, price: 1260, badge: 'Spara 20%' },
  { id: 'agency',  name: 'Agency',  minutes: 5000, price: 3680, badge: 'Bäst värde' },
]

const TYPE_META: Record<string, { label: string; color: string; sign: string }> = {
  credit: { label: 'Påfyllning',      color: '#4ade80',     sign: '+' },
  debit:  { label: 'Använda minuter', color: 'var(--brick)', sign: '−' },
  bonus:  { label: 'Månatlig bonus',  color: 'var(--gold)', sign: '+' },
}

function typeMeta(type: string) {
  return TYPE_META[type] ?? { label: type, color: 'var(--slate)', sign: '' }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Page ───────────────────────────────────────────────────────────────────────
export default function KopMinuterPage() {
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState<MinuteTransaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: balRow }, { data: txns }] = await Promise.all([
        supabase.from('minute_balance').select('balance_minutes').limit(1).maybeSingle(),
        supabase.from('minute_transactions').select('*').order('created_at', { ascending: false }).limit(50),
      ])
      setBalance(balRow?.balance_minutes ?? 0)
      setTransactions((txns ?? []) as MinuteTransaction[])
      setLoading(false)
    }
    load()
  }, [])

  const lowBalance = !loading && balance < LOW_BALANCE_THRESHOLD

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <Panel padding="px-5 py-3" className="inline-block" enableTilt={false}>
        <p className="text-xs tracking-widest" style={{ color: 'var(--brick)' }}>AFFÄR</p>
        <h1 className="text-3xl font-bold mt-1" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
          ⏱ Köp Minuter
        </h1>
      </Panel>

      {/* Low balance warning */}
      {lowBalance && (
        <Panel
          padding="px-5 py-4"
          className="flex items-center gap-3"
          enableTilt={false}
          style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' }}
        >
          <span className="text-xl">⚠️</span>
          <p className="text-sm" style={{ color: '#ef4444' }}>
            Din balans är låg. Fyll på för att hålla dina receptionister svarande.
          </p>
        </Panel>
      )}

      {/* Current Balance */}
      <Panel padding="p-6" enableTilt={false}>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-[10px] tracking-widest uppercase mb-1" style={{ color: 'var(--slate)' }}>
              Nuvarande balans
            </p>
            {loading ? (
              <div className="h-12 w-32 rounded animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />
            ) : (
              <p
                className="text-5xl font-bold"
                style={{
                  fontFamily: 'Arial, Helvetica, sans-serif',
                  color: lowBalance ? '#ef4444' : 'var(--cream)',
                }}
              >
                {balance.toLocaleString('sv-SE')} <span className="text-xl font-normal" style={{ color: 'var(--slate)' }}>min</span>
              </p>
            )}
            <p className="text-sm mt-2" style={{ color: 'var(--slate)' }}>
              Din plan inkluderar {FREE_MONTHLY_MINUTES} gratis minuter varje månad.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-[10px] tracking-widest uppercase mb-0.5" style={{ color: 'var(--slate)' }}>
              Minuterna används av
            </p>
            {USAGE_TYPES.map(u => (
              <div key={u.label} className="flex items-center gap-2 text-sm" style={{ color: 'var(--cream)' }}>
                <span>{u.icon}</span>
                <span>{u.label}</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* Packages */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--cream)' }}>Fyll på minuter</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {PACKAGES.map(pkg => (
            <Panel
              key={pkg.id}
              padding="p-5"
              className="flex flex-col gap-3"
              tiltMaxAngle={6}
              glowColor={pkg.highlight ? '201, 162, 75' : undefined}
              style={pkg.highlight ? { borderColor: 'rgba(201,162,75,0.4)' } : undefined}
            >
              {pkg.badge && (
                <span
                  className="self-start text-[9px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: pkg.highlight ? 'rgba(201,162,75,0.15)' : 'rgba(168,85,247,0.15)',
                    color: pkg.highlight ? 'var(--gold)' : 'var(--brick)',
                    border: `1px solid ${pkg.highlight ? 'rgba(201,162,75,0.3)' : 'rgba(168,85,247,0.3)'}`,
                  }}
                >
                  {pkg.badge}
                </span>
              )}
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--cream)' }}>{pkg.name}</p>
                <p className="text-2xl font-bold mt-1" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
                  {pkg.minutes.toLocaleString('sv-SE')} <span className="text-sm font-normal" style={{ color: 'var(--slate)' }}>min</span>
                </p>
                <p className="text-lg font-semibold mt-1" style={{ color: pkg.highlight ? 'var(--gold)' : 'var(--brick)' }}>
                  {pkg.price.toLocaleString('sv-SE')} kr
                </p>
              </div>
              <div className="text-xs space-y-0.5 flex-1" style={{ color: 'var(--slate)' }}>
                <p>✓ Går aldrig ut</p>
                <p>✓ Delat över hela kontot</p>
              </div>
              <button
                onClick={() => alert('Stripe-koppling kommer snart. Du kan inte köpa minuter ännu.')}
                className="w-full py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: pkg.highlight ? 'var(--gold)' : 'rgba(168,85,247,0.2)',
                  color: pkg.highlight ? '#151313' : 'var(--brick)',
                  border: pkg.highlight ? 'none' : '1px solid rgba(168,85,247,0.3)',
                }}
              >
                Köp
              </button>
            </Panel>
          ))}
        </div>
      </div>

      {/* Activity log */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--cream)' }}>Minutaktivitet</h2>
        {loading ? (
          <Panel padding="p-6" enableTilt={false}>
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--slate)' }}>
              <span className="animate-spin">⟳</span> Laddar aktivitet…
            </div>
          </Panel>
        ) : transactions.length === 0 ? (
          <Panel className="text-center py-16" enableTilt={false}>
            <div className="text-4xl mb-4">⏱</div>
            <p className="font-semibold" style={{ color: 'var(--cream)' }}>Inga transaktioner än</p>
            <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
              Din minuthistorik visas här när du köper eller använder minuter.
            </p>
          </Panel>
        ) : (
          <Panel padding="p-0" className="overflow-hidden" enableTilt={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {['Typ', 'Beskrivning', 'Belopp', 'Saldo efter', 'Datum'].map(col => (
                      <th key={col} className="px-4 py-3 text-left text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--slate)' }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t, i) => {
                    const meta = typeMeta(t.type)
                    return (
                      <tr key={t.id} style={{ borderBottom: i < transactions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                        <td className="px-4 py-3">
                          <span
                            className="text-[10px] font-semibold px-2 py-1 rounded"
                            style={{ backgroundColor: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}30` }}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--slate)' }}>{t.description ?? '—'}</td>
                        <td className="px-4 py-3 font-medium" style={{ color: meta.color }}>
                          {meta.sign}{Math.abs(t.amount).toLocaleString('sv-SE')} min
                        </td>
                        <td className="px-4 py-3" style={{ color: 'var(--cream)' }}>
                          {t.balance_after != null ? `${t.balance_after.toLocaleString('sv-SE')} min` : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--slate)' }}>{formatDate(t.created_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </div>
    </div>
  )
}
