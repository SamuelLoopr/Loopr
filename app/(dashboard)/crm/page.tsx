'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Panel from '../../components/Panel'
import Dropdown from '../../components/Dropdown'
import { supabase } from '@/lib/supabase'
import { LEAD_STATUS, LEAD_STATUSES } from '@/lib/lead-status'

// ─── Types ────────────────────────────────────────────────────────────────────
interface CrmList { id: string; name: string; user_id: string | null }

interface Lead {
  id: string
  list_id: string | null
  name: string | null
  business: string | null
  phone: string | null
  email: string | null
  website: string | null
  status: string | null
  owner_status: string | null
  notes: string | null
  channel: string | null
  ai_score: number | null
  created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
// These slugs moved to lib/lead-status.ts so the dashboard and Cold Call read
// and write the same values instead of each keeping their own spelling.
const STATUSES = LEAD_STATUSES

const OWNER_STATUSES = [
  { value: '',               label: '—' },
  { value: 'intresserad',    label: 'Intresserad' },
  { value: 'ej_intresserad', label: 'Ej intresserad' },
  { value: 'aterkam_senare', label: 'Återkom senare' },
]

const CHANNELS = ['Alla', 'Samtal', 'DMs', 'Email', 'Varma']

const statusLabel = (v: string | null) => STATUSES.find(s => s.value === v)?.label ?? v ?? '—'
const statusColor = (v: string | null) => STATUSES.find(s => s.value === v)?.color ?? 'var(--slate)'

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
  }).filter(row => Object.values(row).some(Boolean))
}

// ─── LeadRow ─────────────────────────────────────────────────────────────────
function LeadRow({ lead, onUpdate }: {
  lead: Lead
  onUpdate: (id: string, patch: Partial<Lead>) => void
}) {
  const [localNotes, setLocalNotes] = useState(lead.notes ?? '')

  function saveNotes() {
    if (localNotes !== (lead.notes ?? '')) {
      onUpdate(lead.id, { notes: localNotes })
    }
  }

  const selectStyle: React.CSSProperties = {
    backgroundColor: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--cream)',
    borderRadius: '6px',
    padding: '3px 6px',
    fontSize: '11px',
    outline: 'none',
    width: '100%',
  }

  const website = lead.website
    ? (lead.website.startsWith('http') ? lead.website : `https://${lead.website}`)
    : null

  return (
    <tr className="border-b transition-colors hover:bg-white/[0.02]" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
      {/* Namn */}
      <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--cream)' }}>
        {lead.name ?? '—'}
      </td>
      {/* Företag */}
      <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'var(--slate)' }}>
        {lead.business ?? '—'}
      </td>
      {/* Telefon */}
      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
        {lead.phone
          ? <a href={`tel:${lead.phone}`} className="hover:underline" style={{ color: 'var(--cream)' }}>{lead.phone}</a>
          : <span style={{ color: 'var(--slate)' }}>—</span>}
      </td>
      {/* Email */}
      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
        {lead.email
          ? <a href={`mailto:${lead.email}`} className="hover:underline" style={{ color: 'var(--cream)' }}>{lead.email}</a>
          : <span style={{ color: 'var(--slate)' }}>—</span>}
      </td>
      {/* Webb */}
      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
        {website
          ? <a href={website} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: 'var(--brick)' }}>
              {lead.website!.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
            </a>
          : <span style={{ color: 'var(--slate)' }}>—</span>}
      </td>
      {/* Status */}
      <td className="px-3 py-2.5">
        <Dropdown
          value={lead.status ?? LEAD_STATUS.NEW}
          onChange={v => onUpdate(lead.id, { status: v })}
          options={STATUSES.map(s => ({ value: s.value, label: s.label }))}
          style={{ ...selectStyle, color: statusColor(lead.status) }}
        />
      </td>
      {/* Ägarstatus */}
      <td className="px-3 py-2.5">
        <Dropdown
          value={lead.owner_status ?? ''}
          onChange={v => onUpdate(lead.id, { owner_status: v || null })}
          options={OWNER_STATUSES.map(s => ({ value: s.value, label: s.label }))}
          style={selectStyle}
        />
      </td>
      {/* Anteckningar */}
      <td className="px-3 py-2.5" style={{ minWidth: '180px' }}>
        <textarea
          value={localNotes}
          onChange={e => setLocalNotes(e.target.value)}
          onBlur={saveNotes}
          rows={2}
          placeholder="Lägg till anteckning…"
          className="w-full resize-none text-xs rounded px-2 py-1 outline-none transition-colors"
          style={{
            backgroundColor: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'var(--cream)',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(168,85,247,0.4)' }}
        />
      </td>
    </tr>
  )
}

// ─── CRM Page ─────────────────────────────────────────────────────────────────
export default function CrmPage() {
  const [lists, setLists] = useState<CrmList[]>([])
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loadingLists, setLoadingLists] = useState(true)
  const [loadingLeads, setLoadingLeads] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [channelFilter, setChannelFilter] = useState('Alla')
  const [search, setSearch] = useState('')
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  // Listorna hör till inloggningen (crm_lists.user_id, 056), inte till
  // webbläsaren som förut (device_id): samma listor på varje enhet.
  const userId = useRef<string | null>(null)
  const [listForm, setListForm] = useState<{ mode: 'new' | 'rename'; id?: string; name: string } | null>(null)
  const [listError, setListError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      userId.current = data.user?.id ?? null
      if (userId.current) fetchLists(userId.current)
      else { setListError('Du är inte inloggad.'); setLoadingLists(false) }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lists ─────────────────────────────────────────────────────────────────
  const fetchLists = useCallback(async (uid: string) => {
    setLoadingLists(true)
    const { data, error } = await supabase
      .from('crm_lists')
      .select('id,name,user_id')
      .eq('user_id', uid)
      .order('created_at')
    if (error) setListError('Kunde inte läsa listorna: ' + error.message)
    const rows = (data ?? []) as CrmList[]
    setLists(rows)
    if (rows.length > 0) {
      const saved = localStorage.getItem('loopr_default_list_id')
      const validSaved = rows.find(r => r.id === saved)
      const target = validSaved ?? rows[0]
      selectList(target.id)
    }
    setLoadingLists(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function selectList(id: string) {
    setSelectedListId(id)
    setStatusFilter(null)
    setChannelFilter('Alla')
    setSearch('')
    localStorage.setItem('loopr_default_list_id', id)
    fetchLeads(id)
  }

  async function fetchLeads(listId: string) {
    setLoadingLeads(true)
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('list_id', listId)
      .order('created_at', { ascending: false })
    setLeads((data ?? []) as Lead[])
    setLoadingLeads(false)
  }

  // Ett fält på sidan i stället för window.prompt: dialogen saknas i vissa
  // webbläsare (bland annat inbäddade), och då hände ingenting utan besked.
  async function submitListForm() {
    if (!listForm) return
    const name = listForm.name.trim()
    if (!name) { setListError('Skriv ett namn på listan.'); return }
    setListError('')
    if (listForm.mode === 'new') {
      if (!userId.current) { setListError('Du är inte inloggad.'); return }
      const { data, error } = await supabase
        .from('crm_lists')
        .insert({ name, user_id: userId.current })
        .select('id,name,user_id')
        .single()
      if (error || !data) { setListError('Kunde inte skapa listan: ' + (error?.message ?? 'okänt fel')); return }
      const newList = data as CrmList
      setLists(prev => [...prev, newList])
      selectList(newList.id)
    } else if (listForm.id) {
      const { error } = await supabase.from('crm_lists').update({ name }).eq('id', listForm.id)
      if (error) { setListError('Kunde inte byta namn: ' + error.message); return }
      setLists(prev => prev.map(l => l.id === listForm.id ? { ...l, name } : l))
    }
    setListForm(null)
  }

  async function deleteList(list: CrmList) {
    // Två tryck i stället för confirm(), av samma skäl som ovan.
    if (confirmDeleteId !== list.id) { setConfirmDeleteId(list.id); return }
    setConfirmDeleteId(null)
    const { error } = await supabase.from('crm_lists').delete().eq('id', list.id)
    if (error) { setListError('Kunde inte ta bort listan: ' + error.message); return }
    const remaining = lists.filter(l => l.id !== list.id)
    setLists(remaining)
    if (remaining.length > 0) {
      selectList(remaining[0].id)
    } else {
      setSelectedListId(null)
      setLeads([])
    }
  }

  // ── Lead updates ──────────────────────────────────────────────────────────
  async function updateLead(id: string, patch: Partial<Lead>) {
    await supabase.from('leads').update(patch).eq('id', id)
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))
  }

  // ── CSV import ────────────────────────────────────────────────────────────
  async function handleCsvFile(file: File) {
    if (!selectedListId) { setImportError('Välj en lista innan du importerar.'); return }
    setImporting(true)
    setImportError('')
    const text = await file.text()
    const rows = parseCSV(text)
    if (rows.length === 0) { setImportError('Kunde inte läsa CSV — kontrollera format.'); setImporting(false); return }

    const toInsert = rows.map(r => ({
      list_id: selectedListId,
      name: r.name || null,
      business: r.business || null,
      phone: r.phone || null,
      email: r.email || null,
      website: r.website || null,
      status: LEAD_STATUS.NEW,
    }))

    const { error } = await supabase.from('leads').insert(toInsert)
    if (error) { setImportError('Import misslyckades: ' + error.message) }
    else { fetchLeads(selectedListId) }
    setImporting(false)
  }

  // ── Computed values ───────────────────────────────────────────────────────
  const statCounts = STATUSES.map(s => ({
    ...s,
    count: leads.filter(l => l.status === s.value).length,
  }))

  const filteredLeads = leads.filter(lead => {
    if (statusFilter && lead.status !== statusFilter) return false
    if (channelFilter !== 'Alla' && lead.channel !== channelFilter.toLowerCase()) return false
    if (search) {
      const q = search.toLowerCase()
      const inName = lead.name?.toLowerCase().includes(q) ?? false
      const inBiz = lead.business?.toLowerCase().includes(q) ?? false
      if (!inName && !inBiz) return false
    }
    return true
  })

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-8">

      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest mb-1" style={{ color: 'var(--brick)' }}>SÄLJPIPELINE</p>
          <h1 className="text-3xl font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>CRM</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* CSV import */}
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = '' }}
          />
          <button
            onClick={() => csvInputRef.current?.click()}
            disabled={!selectedListId || importing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {importing ? '⟳ Importerar…' : '⬆ Importera CSV'}
          </button>
          <button
            onClick={() => { setListError(''); setListForm({ mode: 'new', name: '' }) }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
            style={{ backgroundColor: 'rgba(168,85,247,0.2)', color: 'var(--brick)', border: '1px solid rgba(168,85,247,0.3)' }}
          >
            + Nytt CRM
          </button>
        </div>
      </div>

      {importError && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
          ⚠️ {importError}
        </p>
      )}

      {/* ── List form ─────────────────────────────────────────────────────── */}
      {listForm && (
        <form
          onSubmit={e => { e.preventDefault(); submitListForm() }}
          className="flex items-center gap-2"
        >
          <input
            autoFocus
            value={listForm.name}
            onChange={e => setListForm({ ...listForm, name: e.target.value })}
            placeholder={listForm.mode === 'new' ? 'Namn på ny CRM-lista' : 'Nytt namn'}
            maxLength={80}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.15)', minWidth: 260 }}
          />
          <button type="submit" className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ backgroundColor: 'rgba(168,85,247,0.25)', color: 'var(--brick)', border: '1px solid rgba(168,85,247,0.4)' }}>
            {listForm.mode === 'new' ? 'Skapa' : 'Spara'}
          </button>
          <button type="button" onClick={() => { setListForm(null); setListError('') }} className="px-3 py-2 rounded-lg text-xs" style={{ color: 'var(--slate)' }}>
            Avbryt
          </button>
        </form>
      )}
      {listError && <p className="text-sm" style={{ color: '#ef4444' }}>{listError}</p>}

      {/* ── List tabs ─────────────────────────────────────────────────────── */}
      {loadingLists ? (
        <div className="h-10 flex items-center" style={{ color: 'var(--slate)' }}>
          <span className="animate-spin mr-2">⟳</span> Laddar listor…
        </div>
      ) : lists.length === 0 ? (
        <Panel padding="px-5 py-4" enableTilt={false}>
          <p className="text-sm" style={{ color: 'var(--slate)' }}>Inga CRM-listor ännu — tryck "+ Nytt CRM" för att skapa din första lista.</p>
        </Panel>
      ) : (
        <div className="flex items-center gap-1 flex-wrap">
          {lists.map(list => (
            <div key={list.id} className="flex items-center gap-0.5">
              <button
                onClick={() => selectList(list.id)}
                className="px-4 py-2 rounded-l-lg text-sm font-semibold transition-all"
                style={{
                  backgroundColor: selectedListId === list.id ? 'rgba(168,85,247,0.25)' : 'rgba(255,255,255,0.05)',
                  color: selectedListId === list.id ? 'var(--brick)' : 'var(--slate)',
                  border: `1px solid ${selectedListId === list.id ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  borderRight: 'none',
                  borderRadius: '8px 0 0 8px',
                }}
              >
                {list.name}
              </button>
              <div
                className="flex rounded-r-lg overflow-hidden"
                style={{
                  border: `1px solid ${selectedListId === list.id ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  borderLeft: 'none',
                }}
              >
                <button
                  onClick={() => { setListError(''); setListForm({ mode: 'rename', id: list.id, name: list.name }) }}
                  title="Byt namn"
                  className="px-1.5 py-2 text-xs transition-colors hover:bg-white/10"
                  style={{ color: 'var(--slate)' }}
                >
                  ✏️
                </button>
                <button
                  onClick={() => deleteList(list)}
                  title={confirmDeleteId === list.id ? 'Tryck igen för att ta bort listan. Leads i listan blir kvar utan lista.' : 'Ta bort'}
                  className="px-1.5 py-2 text-xs transition-colors hover:bg-white/10"
                  style={{ color: confirmDeleteId === list.id ? '#ef4444' : 'var(--slate)' }}
                >
                  {confirmDeleteId === list.id ? 'Ta bort?' : '🗑'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pipeline stat cards ───────────────────────────────────────────── */}
      {selectedListId && (
        <div className="grid grid-cols-7 gap-2">
          {statCounts.map(s => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(prev => prev === s.value ? null : s.value)}
              className="rounded-xl py-3 px-2 text-center transition-all"
              style={{
                backgroundColor: statusFilter === s.value ? `${s.color}18` : 'rgba(21,19,19,0.75)',
                border: `1px solid ${statusFilter === s.value ? s.color : 'rgba(255,255,255,0.08)'}`,
                backdropFilter: 'blur(4px)',
              }}
            >
              <p className="text-xl font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: s.color }}>{s.count}</p>
              <p className="text-[9px] mt-0.5 leading-tight" style={{ color: 'var(--slate)' }}>{s.label}</p>
            </button>
          ))}
        </div>
      )}

      {/* ── Filters + search ──────────────────────────────────────────────── */}
      {selectedListId && (
        <div className="flex items-center gap-3 flex-wrap">
          {/* Channel filter tabs */}
          <div className="flex gap-1">
            {CHANNELS.map(ch => (
              <button
                key={ch}
                onClick={() => setChannelFilter(ch)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  backgroundColor: channelFilter === ch ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.04)',
                  color: channelFilter === ch ? 'var(--brick)' : 'var(--slate)',
                  border: `1px solid ${channelFilter === ch ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                {ch}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Sök namn eller företag…"
            className="flex-1 min-w-40 rounded-lg px-3 py-1.5 text-xs outline-none transition-colors"
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--cream)',
            }}
            onFocus={e => { e.target.style.borderColor = 'rgba(168,85,247,0.5)' }}
            onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
          />

          {/* Active filter badge */}
          {(statusFilter || channelFilter !== 'Alla' || search) && (
            <button
              onClick={() => { setStatusFilter(null); setChannelFilter('Alla'); setSearch('') }}
              className="text-xs px-2 py-1.5 rounded-lg"
              style={{ color: 'var(--brick)', backgroundColor: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}
            >
              ✕ Rensa filter
            </button>
          )}
        </div>
      )}

      {/* ── Lead table ────────────────────────────────────────────────────── */}
      {selectedListId && (
        <Panel padding="p-0" className="overflow-hidden" enableTilt={false}>
          {loadingLeads ? (
            <div className="flex items-center gap-2 p-6 text-sm" style={{ color: 'var(--slate)' }}>
              <span className="animate-spin">⟳</span> Laddar leads…
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-base" style={{ color: 'var(--slate)' }}>
                {leads.length === 0 ? 'Inga leads i den här listan än' : 'Inga leads matchar filtret'}
              </p>
              <p className="text-xs mt-2" style={{ color: 'var(--slate)', opacity: 0.5 }}>
                {leads.length === 0
                  ? 'Importera en CSV eller lägg till via Lead Finder.'
                  : 'Rensa filter för att se alla.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm" style={{ minWidth: '900px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    {['Namn', 'Företag', 'Telefon', 'Email', 'Webb', 'Status', 'Ägarstatus', 'Anteckningar'].map(col => (
                      <th key={col} className="px-3 py-2.5 text-left text-[10px] font-semibold tracking-widest uppercase"
                        style={{ color: 'var(--slate)', whiteSpace: 'nowrap' }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map(lead => (
                    <LeadRow key={lead.id} lead={lead} onUpdate={updateLead} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer count */}
          {!loadingLeads && leads.length > 0 && (
            <div className="px-4 py-2 flex items-center justify-between border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <p className="text-[10px]" style={{ color: 'var(--slate)' }}>
                {filteredLeads.length} av {leads.length} leads visas
              </p>
              <p className="text-[10px]" style={{ color: 'var(--slate)' }}>
                {leads.filter(l => l.status === LEAD_STATUS.VUNNEN).length} vunna ·{' '}
                {leads.filter(l => l.status === LEAD_STATUS.FORLORAD).length} förlorade
              </p>
            </div>
          )}
        </Panel>
      )}

    </div>
  )
}
