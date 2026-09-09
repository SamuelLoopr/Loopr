'use client'

import Panel from '@/app/components/Panel'

// ─── Types ────────────────────────────────────────────────────────────────────
interface TrainingItem {
  title: string
  description: string
  badge?: { label: string; color: string }
}

interface TrainingSection {
  heading: string
  items: TrainingItem[]
}

// ─── Content ──────────────────────────────────────────────────────────────────
const SECTIONS: TrainingSection[] = [
  {
    heading: 'Core Training',
    items: [
      { title: 'Offer Builder', description: 'Bygg ett oemotståndligt erbjudande som konverterar kalla leads till kunder.' },
      { title: 'Script Vault', description: 'Färdiga manus för samtal, mejl och DM:s — redo att användas direkt.' },
      { title: 'Objection Library', description: 'De vanligaste invändningarna och hur du bemöter dem med trovärdighet.' },
      { title: 'Niche Selector Quiz', description: 'Hitta din mest lönsamma nisch på under 10 minuter.' },
      { title: 'Lead List Generator', description: 'Bygg riktade leadlistor för din valda bransch och ort.' },
      { title: 'Case Studies', description: 'Verkliga resultat från byråer som växt med Loopr.' },
    ],
  },
  {
    heading: 'Sales & Outreach',
    items: [
      { title: 'Cold Call Frameworks', description: 'Beprövade ramverk som gör kalla samtal mindre kalla.', badge: { label: 'Populär', color: 'var(--gold)' } },
      { title: 'Email Outreach Templates', description: 'Mejlsekvenser som får svar, inte studsar.' },
      { title: 'DM Scripts & Templates', description: 'Konvertera sociala medier-kontakter till bokade möten.' },
      { title: 'Follow-Up Sequences', description: 'Så följer du upp utan att kännas påstridig — och stänger fler affärer.' },
      { title: 'Closing Techniques', description: 'Tekniker för att ta hem affären utan att pressa.' },
      { title: 'Pricing & Packaging Guide', description: 'Hur du prissätter och paketerar dina tjänster för maximal marginal.', badge: { label: 'Viktig', color: 'var(--brick)' } },
    ],
  },
  {
    heading: 'Strategy & Growth',
    items: [
      { title: 'Client Onboarding SOP', description: 'Steg-för-steg-process för en smidig kundresa från dag ett.', badge: { label: 'Ny', color: '#4ade80' } },
      { title: 'Agency Growth Playbook', description: 'Strategin för att skala din byrå från första kunden till sju siffror.' },
      { title: 'Niche Deep Dives', description: 'Djupdykningar i specifika branscher — smärtpunkter, språk, erbjudanden.' },
    ],
  },
]

// ─── Card ─────────────────────────────────────────────────────────────────────
function TrainingCard({ item }: { item: TrainingItem }) {
  return (
    <Panel padding="p-5" className="flex flex-col gap-2" tiltMaxAngle={6}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-sm" style={{ color: 'var(--cream)' }}>{item.title}</h3>
        {item.badge && (
          <span
            className="shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${item.badge.color}22`, color: item.badge.color, border: `1px solid ${item.badge.color}40` }}
          >
            {item.badge.label}
          </span>
        )}
      </div>
      <p className="text-xs flex-1" style={{ color: 'var(--slate)' }}>{item.description}</p>
      <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>🔒 Kommer snart</p>
    </Panel>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────────
export default function UtbildningPage() {
  return (
    <div className="space-y-8 pb-8">
      <Panel className="mb-2 inline-block" padding="px-5 py-3" enableTilt={false}>
        <p className="text-xs tracking-widest" style={{ color: 'var(--brick)' }}>LÄRANDE</p>
        <h1 className="text-3xl font-bold mt-1" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
          🎓 Utbildning
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Allt du behöver för att bygga och skala din AI-byrå.</p>
      </Panel>

      {SECTIONS.map(section => (
        <div key={section.heading}>
          <h2 className="text-sm font-semibold tracking-wide mb-3" style={{ color: 'var(--cream)' }}>{section.heading}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {section.items.map(item => (
              <TrainingCard key={item.title} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
