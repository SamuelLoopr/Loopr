'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Panel from '@/app/components/Panel'
import { supabase } from '@/lib/supabase'
import { isMissingColumn } from '@/lib/db-errors'
import type { ClientCostRow, PeriodKey } from '@/app/api/admin/client-costs/route'
import { formatRate, MIN_RATED, type Resolution } from '@/lib/resolution-rate'

// Aktiva klienter — vad varje kund kostar oss hos Twilio, ElevenLabs och
// Anthropic, och vad de betalar.
//
// Siffrorna kommer från /api/admin/client-costs, som hämtar in nya kostnader
// från leverantörerna innan den summerar. Månadspriset skrivs härifrån med den
// inloggade användarens klient, precis som övriga dashboardsidor skriver sina
// inställningar.

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'days30', label: 'Senaste 30 dagarna' },
  { key: 'month', label: 'Denna månad' },
  { key: 'all', label: 'All tid' },
]

const kr = (n: number) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kr'

interface Payload {
  clients: ClientCostRow[]
  rate: number
  period: PeriodKey
  priceSupported?: boolean
  costsSupported?: boolean
  resolutionSupported?: boolean
  note?: string | null
}

export default function AktivaKlienterPage() {
  const [period, setPeriod] = useState<PeriodKey>('days30')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (p: PeriodKey) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/client-costs?period=${p}`)
      const body = await res.json().catch(() => null)
      if (!res.ok) { setError(body?.error ?? 'Kunde inte hämta kostnaderna.'); return }
      setData(body)
    } catch {
      setError('Ingen kontakt med servern.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(period) }, [load, period])

  const totals = useMemo(() => {
    const list = data?.clients ?? []
    return {
      calls: list.reduce((s, c) => s + c.calls, 0),
      minutes: list.reduce((s, c) => s + c.minutes, 0),
      twilio: list.reduce((s, c) => s + c.costs.twilioSek, 0),
      elevenLabs: list.reduce((s, c) => s + c.costs.elevenLabsSek, 0),
      anthropic: list.reduce((s, c) => s + c.costs.anthropicSek, 0),
      total: list.reduce((s, c) => s + c.costs.totalSek, 0),
      price: list.reduce((s, c) => s + (c.monthlyPriceSek ?? 0), 0),
      margin: list.reduce((s, c) => s + (c.marginSek ?? 0), 0),
      estimated: list.reduce((s, c) => s + c.estimatedCalls, 0),
      missing: list.reduce((s, c) => s + c.missingTwilio + c.missingElevenLabs, 0),
      // Lösningsgraden summeras på samtalen, inte som ett snitt av klienternas
      // procent: annars väger en klient med tre samtal lika tungt som en med
      // trehundra.
      solved: list.reduce((s, c) => s + (c.resolution?.solved ?? 0), 0),
      rated: list.reduce((s, c) => s + (c.resolution?.solved ?? 0) + (c.resolution?.unsolved ?? 0), 0),
      unrated: list.reduce((s, c) => s + (c.resolution?.unrated ?? 0), 0),
    }
  }, [data])

  const priceSupported = data?.priceSupported !== false
  const costsSupported = data?.costsSupported !== false
  const resolutionSupported = data?.resolutionSupported !== false
  const totalRate = totals.rated > 0 ? totals.solved / totals.rated : null

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <p className="text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--brick)' }}>
          Ekonomi
        </p>
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--cream)', fontFamily: 'Arial, Helvetica, sans-serif' }}>
          💰 Aktiva klienter
        </h1>
        <p className="text-sm max-w-2xl" style={{ color: 'var(--slate)' }}>
          Vad varje kund kostar hos Twilio, ElevenLabs och Anthropic — och vad de betalar.
          Bara agenter i klientläge räknas, alltså riktiga kunder och inga demolänkar.
        </p>
      </div>

      {/* Period */}
      <Panel padding="p-4" enableTilt={false} className="mb-5">
        <div className="flex gap-3 flex-wrap items-center justify-between">
          <div role="group" aria-label="Period" className="flex gap-1 rounded-xl p-1" style={{
            backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
          }}>
            {PERIODS.map(p => (
              <button
                key={p.key}
                type="button"
                aria-pressed={period === p.key}
                onClick={() => setPeriod(p.key)}
                className="rounded-lg text-xs font-semibold"
                style={{
                  padding: '7px 14px', cursor: 'pointer', border: 'none',
                  backgroundColor: period === p.key ? 'rgba(168,85,247,0.22)' : 'transparent',
                  color: period === p.key ? 'var(--cream)' : 'var(--slate)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <span className="text-xs" style={{ color: 'var(--slate)' }}>
            {data ? `Kurs ${data.rate} kr/USD` : ''}
          </span>
        </div>
      </Panel>

      {error && (
        <Panel padding="p-4" enableTilt={false} className="mb-5">
          <p className="text-xs" style={{ color: '#ef4444' }}>⚠️ {error}</p>
        </Panel>
      )}

      {(!priceSupported || !costsSupported || data?.note === 'migration') && (
        <Panel padding="p-4" enableTilt={false} className="mb-5">
          <p className="text-xs" style={{ color: 'var(--gold)' }}>
            ⚠️ Kör migration 031_client_costs.sql i Supabase SQL Editor — tills dess visas inga kostnader
            {!priceSupported && ' och inget månadspris går att spara'}.
          </p>
        </Panel>
      )}

      {costsSupported && !resolutionSupported && (
        <Panel padding="p-4" enableTilt={false} className="mb-5">
          <p className="text-xs" style={{ color: 'var(--gold)' }}>
            ⚠️ Kör migration 032_call_resolution.sql i Supabase SQL Editor — tills dess visas ingen
            lösningsgrad. Samtalen analyseras om automatiskt efteråt och fyller i den.
          </p>
        </Panel>
      )}

      {loading && !data ? (
        <Panel padding="p-10" enableTilt={false}>
          <p className="text-sm text-center" style={{ color: 'var(--slate)' }}>Hämtar kostnader…</p>
        </Panel>
      ) : (data?.clients.length ?? 0) === 0 ? (
        <Panel padding="p-10" enableTilt={false}>
          <p className="text-sm text-center mb-3" style={{ color: 'var(--slate)' }}>
            Inga aktiva klienter än. En agent räknas som klient när den står i klientläge.
          </p>
          <p className="text-center">
            <Link href="/bos" style={{ color: 'var(--brick)', fontSize: 13 }}>Gå till Bygg BOS →</Link>
          </p>
        </Panel>
      ) : (
        <>
          {/* Summering */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <Kpi label="Samtal" value={String(totals.calls)} sub={`${totals.minutes} min`} />
            <Kpi
              label="Löses av AI"
              value={totals.rated >= MIN_RATED ? (formatRate(totalRate) ?? '—') : '—'}
              sub={totals.rated >= MIN_RATED ? `${totals.solved} av ${totals.rated} samtal` : 'för få bedömda samtal'}
              accent={totals.rated >= MIN_RATED && totalRate != null && totalRate >= 0.8 ? '#4ade80' : undefined}
            />
            <Kpi label="Kostnad" value={kr(totals.total)} sub={`${totals.minutes ? kr(totals.total / totals.minutes) : '—'}/min`} />
            <Kpi label="Intäkt" value={totals.price ? kr(totals.price) : '—'} sub="satta månadspriser" />
            <Kpi
              label="Marginal"
              value={totals.price ? kr(totals.margin) : '—'}
              sub={totals.price ? `${Math.round((totals.margin / totals.price) * 100)} % av intäkten` : 'sätt pris nedan'}
              accent={totals.price ? (totals.margin >= 0 ? '#4ade80' : '#ef4444') : undefined}
            />
          </div>

          {/* Tabell */}
          <Panel padding="p-0" enableTilt={false} className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 980 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <Th left>Klient</Th>
                    <Th>Samtal</Th>
                    <Th>Minuter</Th>
                    <Th>Löses av AI</Th>
                    <Th>Twilio</Th>
                    <Th>ElevenLabs</Th>
                    <Th>Anthropic</Th>
                    <Th>Kostnad</Th>
                    <Th>Pris/mån</Th>
                    <Th>Marginal</Th>
                  </tr>
                </thead>
                <tbody>
                  {data!.clients.map(c => (
                    <ClientRow
                      key={c.agentId}
                      client={c}
                      priceSupported={priceSupported}
                      onPriceSaved={() => load(period)}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '1px solid rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <Td left bold>Totalt</Td>
                    <Td>{totals.calls}</Td>
                    <Td>{totals.minutes}</Td>
                    <Td bold>{totals.rated >= MIN_RATED ? (formatRate(totalRate) ?? '—') : '—'}</Td>
                    <Td>{kr(totals.twilio)}</Td>
                    <Td>{kr(totals.elevenLabs)}</Td>
                    <Td>{kr(totals.anthropic)}</Td>
                    <Td bold>{kr(totals.total)}</Td>
                    <Td>{totals.price ? kr(totals.price) : '—'}</Td>
                    <Td bold color={totals.price ? (totals.margin >= 0 ? '#4ade80' : '#ef4444') : undefined}>
                      {totals.price ? kr(totals.margin) : '—'}
                    </Td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>

          <div className="mt-4 space-y-1">
            {totals.estimated > 0 && (
              <p className="text-[11px]" style={{ color: 'var(--slate)' }}>
                * Anthropic-kostnaden är uppskattad för {totals.estimated} samtal. Den går inte att hämta i
                efterhand, så samtal som analyserades före migration 031 räknas på ett uppmätt snitt
                (~0,09 kr/samtal). Samtal analyserade efter den körs på faktisk tokenförbrukning.
              </p>
            )}
            {totals.missing > 0 && (
              <p className="text-[11px]" style={{ color: 'var(--slate)' }}>
                * {totals.missing} kostnadsposter saknas hos leverantören — oftast samtal som aldrig
                debiterades (upptaget, inget svar) eller där priset inte hunnit sättas än.
              </p>
            )}
            {resolutionSupported && (
              <p className="text-[11px]" style={{ color: 'var(--slate)' }}>
                * &quot;Löses av AI&quot; är samtal där den som ringde fick vad den behövde och ingenting
                återstår för klienten att göra. Samtal med en kontaktförfrågan — offert, bokning,
                återuppringning — räknas som olösta, liksom samtal där receptionisten inte kunde svara.
                {totals.unrated > 0 && ` ${totals.unrated} samtal där ingen sa något, eller som inte
                hunnit analyseras, räknas varken som lösta eller olösta.`}
                {' '}Siffran visas från {MIN_RATED} bedömda samtal och uppåt.
              </p>
            )}
            <p className="text-[11px]" style={{ color: 'var(--slate)' }}>
              Leverantörerna fakturerar i USD. Kursen sätts med USD_TO_SEK_RATE i servermiljön.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function ClientRow({
  client, priceSupported, onPriceSaved,
}: {
  client: ClientCostRow
  priceSupported: boolean
  onPriceSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(client.monthlyPriceSek?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    const trimmed = draft.trim().replace(',', '.')
    const value = trimmed === '' ? null : Number(trimmed)
    if (value !== null && (!Number.isFinite(value) || value < 0)) { setError('Ogiltigt pris'); return }

    setSaving(true)
    setError('')
    const { error: e } = await supabase.from('agents').update({ monthly_price_sek: value }).eq('id', client.agentId)
    setSaving(false)
    if (e) { setError(isMissingColumn(e) ? 'Kör migration 031' : e.message); return }
    setEditing(false)
    onPriceSaved()
  }

  const marginColor = client.marginSek == null ? undefined : client.marginSek >= 0 ? '#4ade80' : '#ef4444'

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <Td left>
        <span className="font-semibold" style={{ color: 'var(--cream)' }}>{client.name}</span>
        <span className="block text-[11px]" style={{ color: 'var(--slate)' }}>
          {client.phoneNumbers.length ? client.phoneNumbers.join(', ') : 'inget nummer kopplat'}
        </span>
      </Td>
      <Td>{client.calls}</Td>
      <Td>{client.minutes}</Td>
      <ResolutionTd resolution={client.resolution} />
      <Td>{kr(client.costs.twilioSek)}</Td>
      <Td>{kr(client.costs.elevenLabsSek)}</Td>
      <Td>
        {kr(client.costs.anthropicSek)}
        {client.estimatedCalls > 0 && <span style={{ color: 'var(--gold)' }} title={`${client.estimatedCalls} samtal uppskattade`}> *</span>}
      </Td>
      <Td bold>{kr(client.costs.totalSek)}</Td>
      <Td>
        {editing ? (
          <span className="inline-flex gap-1 items-center">
            <input
              value={draft}
              autoFocus
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
              placeholder="0"
              aria-label={`Månadspris för ${client.name}`}
              style={{
                width: 76, fontSize: 12.5, padding: '5px 7px', borderRadius: 7, outline: 'none',
                color: 'var(--cream)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)',
              }}
            />
            <button onClick={save} disabled={saving} style={miniBtn('var(--brick)')}>{saving ? '…' : 'Spara'}</button>
            <button onClick={() => { setEditing(false); setError('') }} style={miniBtn()}>✕</button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => { setDraft(client.monthlyPriceSek?.toString() ?? ''); setEditing(true) }}
            disabled={!priceSupported}
            style={{
              background: 'none', border: 'none', padding: 0, font: 'inherit',
              cursor: priceSupported ? 'pointer' : 'not-allowed',
              color: client.monthlyPriceSek != null ? 'var(--cream)' : 'var(--brick)',
            }}
          >
            {client.monthlyPriceSek != null ? kr(client.monthlyPriceSek) : '+ sätt pris'}
          </button>
        )}
        {error && <span className="block text-[10px]" style={{ color: '#ef4444' }}>{error}</span>}
      </Td>
      <Td bold color={marginColor}>
        {client.marginSek != null ? kr(client.marginSek) : '—'}
      </Td>
    </tr>
  )
}

/**
 * Lösningsgraden för en klient.
 *
 * Under MIN_RATED bedömda samtal visas antalet i stället för procenten: "100 %"
 * på ett enda samtal är sant men säger ingenting, och det är precis den sortens
 * siffra som får någon att misstro resten av tabellen.
 */
function ResolutionTd({ resolution }: { resolution: Resolution | null }) {
  if (!resolution) return <Td>—</Td>

  const rated = resolution.solved + resolution.unsolved
  if (rated < MIN_RATED) {
    return <Td color="var(--slate)">{rated > 0 ? `${resolution.solved}/${rated}` : '—'}</Td>
  }

  const rate = resolution.rate ?? 0
  return (
    <Td color={rate >= 0.8 ? '#4ade80' : rate >= 0.5 ? undefined : 'var(--gold)'}>
      <span title={`${resolution.solved} lösta, ${resolution.unsolved} kräver uppföljning, ${resolution.unrated} obedömda`}>
        {formatRate(resolution.rate)}
      </span>
    </Td>
  )
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <Panel padding="p-4" enableTilt={false}>
      <p className="text-[10px] font-semibold tracking-widest uppercase mb-1" style={{ color: 'var(--slate)' }}>{label}</p>
      <p className="text-xl font-bold" style={{ color: accent ?? 'var(--cream)' }}>{value}</p>
      {sub && <p className="text-[11px] mt-0.5" style={{ color: 'var(--slate)' }}>{sub}</p>}
    </Panel>
  )
}

const cellStyle = (left?: boolean): React.CSSProperties => ({
  padding: '11px 14px', fontSize: 13, textAlign: left ? 'left' : 'right', whiteSpace: 'nowrap',
})

function Th({ children, left }: { children: React.ReactNode; left?: boolean }) {
  return (
    <th style={{
      ...cellStyle(left), fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: 'var(--slate)',
    }}>
      {children}
    </th>
  )
}

function Td({ children, left, bold, color }: { children: React.ReactNode; left?: boolean; bold?: boolean; color?: string }) {
  return (
    <td style={{ ...cellStyle(left), fontWeight: bold ? 700 : 400, color: color ?? 'var(--cream)' }}>
      {children}
    </td>
  )
}

const miniBtn = (bg?: string): React.CSSProperties => ({
  borderRadius: 7, padding: '5px 9px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
  border: bg ? 'none' : '1px solid rgba(255,255,255,0.15)',
  background: bg ?? 'transparent', color: bg ? 'white' : 'var(--slate)',
})
