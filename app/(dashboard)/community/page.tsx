'use client'

import Panel from '@/app/components/Panel'

// ─── Content ──────────────────────────────────────────────────────────────────
const DISCORD_URL = 'https://discord.gg/loopr-placeholder'

const FEATURES = [
  { icon: '🏆', title: 'Dela Vinster', description: 'Fira dina wins med andra som förstår resan — och lär dig av deras.' },
  { icon: '🎯', title: 'Dela Mål', description: 'Sätt mål tillsammans med communityn och håll dig ansvarig.' },
  { icon: '💬', title: 'Direktkontakt med Grundaren', description: 'Ställ frågor direkt till Loopr-teamet — ingen support-kö.' },
  { icon: '❓', title: 'Fråga Vad Som Helst', description: 'Inga dumma frågor. Få hjälp av byråägare som redan varit där.' },
  { icon: '📈', title: 'Tillväxtstrategier', description: 'Taktiker som fungerar just nu, delade av medlemmar som testat dem.' },
  { icon: '🤝', title: 'Hitta Partners', description: 'Hitta samarbetspartners, underleverantörer eller din nästa anställd.' },
]

// ─── Page ───────────────────────────────────────────────────────────────────────
export default function CommunityPage() {
  return (
    <div className="space-y-6 pb-8">
      {/* Hero */}
      <Panel padding="p-8" enableTilt={false}>
        <span
          className="inline-block text-[10px] font-bold px-2.5 py-1 rounded-full mb-3"
          style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: 'var(--brick)', border: '1px solid rgba(168,85,247,0.3)' }}
        >
          🔒 Privat Community
        </span>
        <h1 className="text-3xl font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
          👥 Gå med i Loopr-communityn
        </h1>
        <p className="text-sm mt-3 max-w-xl" style={{ color: 'var(--slate)' }}>
          Nätverka med andra byråägare som bygger med Loopr, dela erfarenheter och få hjälp direkt från de som varit där.
        </p>
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 mt-5 px-5 py-2.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ backgroundColor: 'var(--brick)', color: 'white' }}
        >
          💬 Gå med i Discord
        </a>
      </Panel>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {FEATURES.map(f => (
          <Panel key={f.title} padding="p-5" className="flex flex-col gap-2" tiltMaxAngle={6}>
            <span className="text-2xl">{f.icon}</span>
            <h3 className="font-semibold text-sm mt-1" style={{ color: 'var(--cream)' }}>{f.title}</h3>
            <p className="text-xs" style={{ color: 'var(--slate)' }}>{f.description}</p>
          </Panel>
        ))}
      </div>

      {/* Closing banner */}
      <Panel
        padding="p-8"
        className="text-center"
        enableTilt={false}
        style={{ backgroundColor: 'rgba(168,85,247,0.1)', borderColor: 'rgba(168,85,247,0.3)' }}
      >
        <h2 className="text-2xl font-bold" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
          Detta är ditt orättvisa övertag
        </h2>
        <p className="text-sm mt-2 max-w-lg mx-auto" style={{ color: 'var(--slate)' }}>
          Byråägare i communityn växer snabbare — inte för att de jobbar hårdare, utan för att de aldrig gissar ensamma.
        </p>
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-5 px-6 py-3 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
          style={{ backgroundColor: 'var(--brick)', color: 'white' }}
        >
          Gå Med Nu →
        </a>
      </Panel>
    </div>
  )
}
