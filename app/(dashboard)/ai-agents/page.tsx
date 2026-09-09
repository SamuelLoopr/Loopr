import Link from 'next/link'
import Panel from '@/app/components/Panel'

const AGENT_TYPES = [
  {
    icon: '📞',
    title: 'AI-Receptionist',
    description: 'En AI som svarar i telefon, bokar möten och hanterar kundsamtal dygnet runt — utan att du lyfter ett finger.',
    href: '/ai-agents/receptionist',
    ready: true,
    color: 'var(--brick)',
    features: ['Bokar möten automatiskt', 'Svarar på vanliga frågor', 'Kopplar vidare vid behov'],
  },
  {
    icon: '⚡',
    title: 'Speed-to-Lead Agent',
    description: 'Kontaktar nya leads automatiskt inom sekunder via SMS eller samtal — innan konkurrenterna hinner reagera.',
    href: '/speed-to-lead',
    ready: true,
    color: 'var(--gold)',
    features: ['Svarar inom 30 sekunder', 'Kvalificerar leads automatiskt', 'SMS + samtal'],
  },
  {
    icon: '⭐',
    title: 'Google Review Automator',
    description: 'Skickar automatiska recensionsförfrågningar efter avslutat jobb och ökar ditt betyg på Google.',
    href: '/review-automation',
    ready: true,
    color: '#4ade80',
    features: ['Timing-baserade utskick', 'Personliga SMS', 'Direkt Google-länk'],
  },
  {
    icon: '🔍',
    title: 'AI Audit Maker',
    description: 'Analyserar lokala företags online-närvaro och genererar en delbar AI-revision med konkreta åtgärder.',
    href: '/ai-audit-maker',
    ready: true,
    color: '#60a5fa',
    features: ['Webbplatsanalys', 'Delbar rapport-URL', 'Konkreta rekommendationer'],
  },
]

export default function AiAgentsPage() {
  return (
    <div className="space-y-6 pb-8">
      <div>
        <p className="text-xs tracking-widest mb-1" style={{ color: 'var(--brick)' }}>AI & AUTOMATION</p>
        <h1 className="text-3xl font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
          AI Agenter
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Välj en agent att bygga och driftsätta.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {AGENT_TYPES.map(agent => (
          <Panel key={agent.title} padding="p-6" className="flex flex-col gap-4" tiltMaxAngle={6}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                style={{ backgroundColor: `${agent.color}18`, border: `1px solid ${agent.color}30` }}>
                {agent.icon}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-base" style={{ color: 'var(--cream)', fontFamily: 'Arial, Helvetica, sans-serif' }}>
                  {agent.title}
                </h2>
                {agent.ready
                  ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: 'rgba(74,222,128,0.12)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}>REDO</span>
                  : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--slate)', border: '1px solid rgba(255,255,255,0.1)' }}>SNART</span>
                }
              </div>
            </div>

            <p className="text-sm leading-relaxed" style={{ color: 'var(--slate)' }}>{agent.description}</p>

            <ul className="space-y-1">
              {agent.features.map(f => (
                <li key={f} className="flex items-center gap-2 text-xs" style={{ color: 'var(--slate)' }}>
                  <span style={{ color: agent.color }}>✓</span>{f}
                </li>
              ))}
            </ul>

            <div className="pt-2 mt-auto">
              {agent.ready
                ? <Link href={agent.href}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                    style={{ backgroundColor: `${agent.color}20`, color: agent.color, border: `1px solid ${agent.color}40` }}>
                    Öppna Byggare →
                  </Link>
                : <span className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold opacity-40 cursor-not-allowed"
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--slate)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    Kommer snart
                  </span>
              }
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}
