'use client'

import { useState, useEffect, useCallback } from 'react'
import Panel from '@/app/components/Panel'
import { supabase } from '@/lib/supabase'
import { copyText } from '@/lib/clipboard'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DemosTabAgent {
  id: string
  name: string
  business_name: string | null
  lead_id: string | null
  public_share_id: string | null
}

interface Lead {
  id: string
  name: string | null
  business: string | null
  phone: string | null
  email: string | null
  website: string | null
}

type DemoKind = 'prova' | 'audit' | 'forslag' | 'demo'

interface DemoDef {
  kind: DemoKind
  icon: string
  label: string
  route: string
  blurb: string
  /** Extra field the generator needs before it can create the link. */
  needs?: { label: string; placeholder: string; hint: string }
}

const DEMOS: DemoDef[] = [
  {
    kind: 'prova',
    icon: '🎙️',
    label: 'Röstdemo',
    route: 'prova',
    blurb: 'Kunden pratar med sin AI-receptionist direkt i webbläsaren — inget konto krävs.',
  },
  {
    kind: 'audit',
    icon: '📊',
    label: 'AI-Audit',
    route: 'audit',
    blurb: 'Automatisk genomlysning av kundens webbplats med konkreta förbättringsförslag.',
    needs: {
      label: 'Webbplats att analysera',
      placeholder: 'exempel.se',
      hint: 'Vi hittade ingen webbplats på leaden — fyll i en så genererar vi auditen.',
    },
  },
  {
    kind: 'forslag',
    icon: '📄',
    label: 'Förslag',
    route: 'forslag',
    blurb: 'Delbar förslagssida med erbjudande, värde och kontaktuppgifter.',
  },
  {
    kind: 'demo',
    icon: '💬',
    label: 'SMS-demo',
    route: 'demo',
    blurb: 'Interaktiv demo av recensionsautomationen — kunden ser hela SMS-flödet.',
    needs: {
      label: 'Google-recensionslänk',
      placeholder: 'https://g.page/r/…',
      hint: 'SMS-demon behöver kundens Google-recensionslänk för att se äkta ut.',
    },
  },
]

// Same generator the rest of the app uses (review-automation, generate-audit,
// the Test tab's demo link) — kept identical so share_ids look consistent.
function genShareId() {
  return Math.random().toString(36).substring(2, 10)
}

const DEFAULT_SMS_TEMPLATE =
  'Hej {{kund_namn}}, tack för att du valde {{företag}}! Vi skulle uppskatta en snabb recension på Google: {{review_url}}'

const MIGRATION_HINT =
  'Kolumnen agent_id saknas — kör migration 015_agent_demo_links.sql i Supabase SQL Editor först.'

function isMissingAgentIdColumn(message: string) {
  return message.includes('agent_id') && message.includes('does not exist')
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DemosTab({ agent }: { agent: DemosTabAgent }) {
  const [shareIds, setShareIds] = useState<Record<DemoKind, string | null>>({
    prova: agent.public_share_id,
    audit: null,
    forslag: null,
    demo: null,
  })
  const [lead, setLead] = useState<Lead | null>(null)
  const [senderName, setSenderName] = useState('')
  const [origin, setOrigin] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<DemoKind | null>(null)
  const [errors, setErrors] = useState<Partial<Record<DemoKind, string>>>({})
  const [copied, setCopied] = useState<string | null>(null)
  const [copyFailed, setCopyFailed] = useState<string | null>(null)
  const [migrationNeeded, setMigrationNeeded] = useState(false)
  const [promptFor, setPromptFor] = useState<DemoKind | null>(null)
  const [promptValue, setPromptValue] = useState('')

  // window is not available during SSR, so the origin is read after mount.
  useEffect(() => setOrigin(window.location.origin), [])

  const businessName = agent.business_name || lead?.business || agent.name

  // ── Load everything this tab shows ────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const nextErrors: Partial<Record<DemoKind, string>> = {}
    let needsMigration = false

    // Lead (phone/email/website drive the "Skicka till klient" buttons)
    if (agent.lead_id) {
      const { data } = await supabase
        .from('leads')
        .select('id, name, business, phone, email, website')
        .eq('id', agent.lead_id)
        .maybeSingle()
      if (data) setLead(data)
    }

    // Sender name for the message signature
    const { data: profile } = await supabase
      .from('profile')
      .select('display_name, business_name')
      .limit(1)
      .maybeSingle()
    if (profile) setSenderName(profile.display_name ?? profile.business_name ?? '')

    // Proposal — already linked by agent_id since the initial schema
    const { data: prop } = await supabase
      .from('proposals')
      .select('share_id')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Audit + review client — linked by migration 015. Until that has run the
    // column is missing, so the tab still renders and says what to do.
    const { data: audit, error: auditErr } = await supabase
      .from('audits')
      .select('share_id')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (auditErr && isMissingAgentIdColumn(auditErr.message)) needsMigration = true
    else if (auditErr) nextErrors.audit = auditErr.message

    const { data: rc, error: rcErr } = await supabase
      .from('review_clients')
      .select('share_id')
      .eq('agent_id', agent.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (rcErr && isMissingAgentIdColumn(rcErr.message)) needsMigration = true
    else if (rcErr) nextErrors.demo = rcErr.message

    setShareIds({
      prova: agent.public_share_id,
      audit: audit?.share_id ?? null,
      forslag: prop?.share_id ?? null,
      demo: rc?.share_id ?? null,
    })
    setMigrationNeeded(needsMigration)
    setErrors(nextErrors)
    setLoading(false)
  }, [agent.id, agent.lead_id, agent.public_share_id])

  useEffect(() => { load() }, [load])

  // ── Link helpers ──────────────────────────────────────────────────────
  const urlFor = (d: DemoDef) => {
    const id = shareIds[d.kind]
    return id ? `${origin}/${d.route}/${id}` : ''
  }

  const generated = DEMOS.filter(d => shareIds[d.kind])
  const allReady = generated.length === DEMOS.length

  async function copy(text: string, key: string) {
    const ok = await copyText(text)
    if (!ok) { setCopyFailed(key); setTimeout(() => setCopyFailed(f => (f === key ? null : f)), 3000); return }
    setCopied(key)
    setTimeout(() => setCopied(c => (c === key ? null : c)), 2000)
  }

  // ── Prefilled outbound messages ───────────────────────────────────────
  // These open the user's own SMS/mail app with the text filled in — nothing
  // is sent automatically, the user presses send themselves.
  function greeting() {
    const first = lead?.name?.trim().split(/\s+/)[0]
    return first ? `Hej ${first}!` : 'Hej!'
  }

  function signature() {
    return senderName ? `\n\nVänliga hälsningar,\n${senderName}` : ''
  }

  function messageFor(d: DemoDef): { subject: string; body: string } {
    const url = urlFor(d)
    const intro: Record<DemoKind, string> = {
      prova: `Här är din AI-receptionist — ring den direkt i webbläsaren och hör hur den låter när den svarar dina kunder:`,
      audit: `Här är den kostnadsfria genomlysningen av er webbplats, med konkreta förbättringsförslag:`,
      forslag: `Här är förslaget vi pratade om:`,
      demo: `Här är en demo av recensionsautomationen — klicka runt så ser du precis vad era kunder får:`,
    }
    const subject: Record<DemoKind, string> = {
      prova: `Din AI-receptionist för ${businessName}`,
      audit: `Genomlysning av ${businessName}`,
      forslag: `Förslag till ${businessName}`,
      demo: `Recensionsautomation för ${businessName}`,
    }
    return {
      subject: subject[d.kind],
      body: `${greeting()}\n\n${intro[d.kind]}\n${url}${signature()}`,
    }
  }

  function bundleMessage(): { subject: string; body: string } {
    const lines = generated.map(d => `${d.icon} ${d.label}:\n${urlFor(d)}`).join('\n\n')
    return {
      subject: `Demos för ${businessName}`,
      body: `${greeting()}\n\nHär är allt vi gick igenom, samlat på ett ställe:\n\n${lines}${signature()}`,
    }
  }

  // iOS wants "?&body=", Android accepts it too — this is the form that works
  // across both without a user-agent sniff.
  const smsHref = (body: string) =>
    `sms:${(lead?.phone ?? '').replace(/\s/g, '')}?&body=${encodeURIComponent(body)}`
  const mailHref = (subject: string, body: string) =>
    `mailto:${lead?.email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  // ── Generators ────────────────────────────────────────────────────────
  function setError(kind: DemoKind, message: string) {
    setErrors(prev => ({ ...prev, [kind]: message }))
  }

  async function generate(d: DemoDef, extra?: string) {
    setBusy(d.kind)
    setErrors(prev => ({ ...prev, [d.kind]: undefined }))

    try {
      if (d.kind === 'prova') {
        const shareId = genShareId() + Math.random().toString(36).substring(2, 6)
        const { error } = await supabase.from('agents').update({ public_share_id: shareId }).eq('id', agent.id)
        if (error) throw new Error(
          error.message.includes('public_share_id')
            ? 'Kolumnen public_share_id saknas — kör migration 014_agent_public_demo.sql i Supabase först.'
            : error.message
        )
        setShareIds(prev => ({ ...prev, prova: shareId }))
      }

      if (d.kind === 'forslag') {
        const shareId = genShareId()
        const { error } = await supabase.from('proposals').insert({
          title: `Förslag till ${businessName}`,
          tagline: 'AI-receptionist som svarar på varje samtal, dygnet runt.',
          is_public: true,
          status: 'draft',
          share_id: shareId,
          agent_id: agent.id,
          lead_id: agent.lead_id,
        })
        if (error) throw new Error(error.message)
        setShareIds(prev => ({ ...prev, forslag: shareId }))
      }

      if (d.kind === 'audit') {
        const website = (extra ?? lead?.website ?? '').trim()
        if (!website) { setPromptFor('audit'); setBusy(null); return }
        const res = await fetch('/api/generate-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessName,
            websiteUrl: website,
            agentId: agent.id,
            leadId: agent.lead_id,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Kunde inte generera audit')
        setShareIds(prev => ({ ...prev, audit: data.audit.share_id }))
      }

      if (d.kind === 'demo') {
        const reviewUrl = (extra ?? '').trim()
        if (!reviewUrl) { setPromptFor('demo'); setBusy(null); return }
        const shareId = genShareId()
        const { error } = await supabase.from('review_clients').insert({
          business_name: businessName,
          google_review_url: reviewUrl,
          delay_minutes: 30,
          // Explicit rather than relying on the column default — the default only
          // exists on databases where 008 actually created the table.
          message_template: DEFAULT_SMS_TEMPLATE,
          share_id: shareId,
          demo_generated_at: new Date().toISOString(),
          agent_id: agent.id,
          lead_id: agent.lead_id,
        })
        if (error) throw new Error(isMissingAgentIdColumn(error.message) ? MIGRATION_HINT : error.message)
        setShareIds(prev => ({ ...prev, demo: shareId }))
      }

      setPromptFor(null)
      setPromptValue('')
    } catch (err) {
      setError(d.kind, err instanceof Error ? err.message : String(err))
    }
    setBusy(null)
  }

  // ── Styles shared with the rest of the agent view ─────────────────────
  const btnBase: React.CSSProperties = {
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 12,
    fontWeight: 600,
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  }
  const btnGhost: React.CSSProperties = {
    ...btnBase,
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: 'var(--slate)',
    border: '1px solid rgba(255,255,255,0.1)',
  }
  const btnBrick: React.CSSProperties = {
    ...btnBase,
    backgroundColor: 'rgba(168,85,247,0.15)',
    color: 'var(--brick)',
    border: '1px solid rgba(168,85,247,0.25)',
  }
  const btnOk: React.CSSProperties = {
    ...btnBase,
    backgroundColor: 'rgba(74,222,128,0.15)',
    color: '#4ade80',
    border: '1px solid rgba(74,222,128,0.3)',
  }
  const btnWarn: React.CSSProperties = {
    ...btnBase,
    backgroundColor: 'rgba(239,68,68,0.12)',
    color: '#ef4444',
    border: '1px solid rgba(239,68,68,0.3)',
  }

  if (loading) {
    return (
      <Panel padding="p-8" tiltMaxAngle={4}>
        <p className="text-sm text-center" style={{ color: 'var(--slate)' }}>Laddar demolänkar…</p>
      </Panel>
    )
  }

  const bundle = bundleMessage()

  return (
    <div className="space-y-4">
      {/* ── Migration notice ──────────────────────────────────────────── */}
      {migrationNeeded && (
        <Panel padding="p-4" tiltMaxAngle={3} glowColor="201, 162, 75">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--gold)' }}>
            ⚠️ {MIGRATION_HINT} Audit och SMS-demo kan inte kopplas till den här agenten förrän den är körd —
            övriga länkar fungerar som vanligt.
          </p>
        </Panel>
      )}

      {/* ── Summary + bulk actions (wide card → low tilt) ─────────────── */}
      <Panel padding="p-5" enableTilt={false}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-widest uppercase mb-1" style={{ color: 'var(--slate)' }}>
              Klientpaket
            </p>
            <h3 className="text-lg font-bold mb-1" style={{ color: 'var(--cream)' }}>
              {generated.length} av {DEMOS.length} demolänkar klara
            </h3>
            <p className="text-xs" style={{ color: 'var(--slate)' }}>
              {allReady
                ? 'Hela paketet är redo att skickas till kunden.'
                : 'Generera de som saknas nedan så kan du skicka allt på en gång.'}
            </p>
          </div>

          <div className="flex gap-2 flex-wrap shrink-0">
            <button
              onClick={() => copy(generated.map(d => `${d.label}: ${urlFor(d)}`).join('\n'), 'all')}
              disabled={generated.length === 0}
              style={{
                ...(copied === 'all' ? btnOk : copyFailed === 'all' ? btnWarn : btnBrick),
                opacity: generated.length === 0 ? 0.4 : 1,
                cursor: generated.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {copied === 'all'
                ? '✓ Kopierat'
                : copyFailed === 'all'
                  ? '⚠️ Kopiering blockerad'
                  : `📋 Kopiera alla (${generated.length})`}
            </button>

            {lead?.phone && generated.length > 0 && (
              <a href={smsHref(bundle.body)} style={{ ...btnGhost, display: 'inline-block' }}>
                💬 SMS:a alla
              </a>
            )}
            {lead?.email && generated.length > 0 && (
              <a href={mailHref(bundle.subject, bundle.body)} style={{ ...btnGhost, display: 'inline-block' }}>
                ✉️ Maila alla
              </a>
            )}
          </div>
        </div>

        {!lead && (
          <p className="text-[11px] mt-3 pt-3" style={{ color: 'var(--slate)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            Ingen lead kopplad till den här agenten — koppla en i CRM för att kunna skicka direkt till kundens
            telefon eller mail.
          </p>
        )}
        {lead && !lead.phone && !lead.email && (
          <p className="text-[11px] mt-3 pt-3" style={{ color: 'var(--slate)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            Leaden <span style={{ color: 'var(--cream)' }}>{lead.name ?? lead.business}</span> saknar både telefon
            och mail — fyll i det i CRM så kan du skicka länkarna direkt härifrån.
          </p>
        )}
      </Panel>

      {/* ── One card per demo ─────────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        {DEMOS.map(d => {
          const url = urlFor(d)
          const ready = Boolean(url)
          const msg = ready ? messageFor(d) : null
          const isBusy = busy === d.kind
          const asking = promptFor === d.kind

          return (
            <Panel key={d.kind} padding="p-5" tiltMaxAngle={6} className="flex flex-col">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xl shrink-0">{d.icon}</span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold truncate" style={{ color: 'var(--cream)' }}>{d.label}</h4>
                    <p className="text-[10px]" style={{ color: 'var(--slate)' }}>/{d.route}</p>
                  </div>
                </div>
                <span
                  className="shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full"
                  style={{
                    backgroundColor: ready ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.05)',
                    color: ready ? '#4ade80' : 'var(--slate)',
                    border: `1px solid ${ready ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.1)'}`,
                  }}
                >
                  {ready ? 'Genererad' : 'Ej genererad'}
                </span>
              </div>

              <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--slate)' }}>{d.blurb}</p>

              {/* Link + actions, or the generate button */}
              <div className="mt-auto space-y-2.5">
                {ready ? (
                  <>
                    <code
                      className="block truncate text-[11px] px-3 py-2 rounded-lg"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--cream)',
                      }}
                    >
                      {url}
                    </code>

                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => copy(url, d.kind)}
                        style={copied === d.kind ? btnOk : copyFailed === d.kind ? btnWarn : btnBrick}
                        title={copyFailed === d.kind ? 'Webbläsaren blockerade kopiering — markera länken ovan istället.' : undefined}
                      >
                        {copied === d.kind ? '✓ Kopierad' : copyFailed === d.kind ? '⚠️ Blockerad' : 'Kopiera'}
                      </button>
                      <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...btnGhost, display: 'inline-block' }}>
                        Öppna ↗
                      </a>
                      {lead?.phone && msg && (
                        <a href={smsHref(msg.body)} style={{ ...btnGhost, display: 'inline-block' }} title={`SMS till ${lead.phone}`}>
                          💬 SMS
                        </a>
                      )}
                      {lead?.email && msg && (
                        <a href={mailHref(msg.subject, msg.body)} style={{ ...btnGhost, display: 'inline-block' }} title={`Mail till ${lead.email}`}>
                          ✉️ Mail
                        </a>
                      )}
                    </div>
                  </>
                ) : asking && d.needs ? (
                  <div className="space-y-2">
                    <p className="text-[11px]" style={{ color: 'var(--gold)' }}>{d.needs.hint}</p>
                    <input
                      value={promptValue}
                      onChange={e => setPromptValue(e.target.value)}
                      placeholder={d.needs.placeholder}
                      autoFocus
                      className="w-full"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(168,85,247,0.35)',
                        color: 'var(--cream)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        fontSize: 13,
                        outline: 'none',
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => generate(d, promptValue)}
                        disabled={!promptValue.trim() || isBusy}
                        style={{ ...btnBrick, opacity: !promptValue.trim() || isBusy ? 0.5 : 1 }}
                      >
                        {isBusy ? '⟳ Skapar…' : 'Skapa länk'}
                      </button>
                      <button onClick={() => { setPromptFor(null); setPromptValue('') }} style={btnGhost}>
                        Avbryt
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => generate(d)}
                    disabled={isBusy || (migrationNeeded && (d.kind === 'audit' || d.kind === 'demo'))}
                    style={{
                      ...btnBrick,
                      width: '100%',
                      opacity: isBusy || (migrationNeeded && (d.kind === 'audit' || d.kind === 'demo')) ? 0.5 : 1,
                    }}
                  >
                    {isBusy
                      ? (d.kind === 'audit' ? '⟳ Analyserar webbplats…' : '⟳ Skapar…')
                      : '🔗 Generera länk'}
                  </button>
                )}

                {errors[d.kind] && (
                  <p className="text-[11px]" style={{ color: '#ef4444' }}>⚠️ {errors[d.kind]}</p>
                )}
              </div>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}
