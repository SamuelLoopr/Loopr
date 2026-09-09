'use client'

import Panel from '@/app/components/Panel'

// The "Varför Loopr" selling points. Extracted from the Master Demo one-pager
// so the per-prospect page and the public Loopr page always show the same four
// arguments instead of two copies drifting apart.

export const BENEFITS = [
  { icon: '📞', title: 'Missa aldrig ett samtal', body: 'Varje samtal besvaras direkt — även kvällar, helger och mitt under ett pågående jobb.' },
  { icon: '🇸🇪', title: 'Svensktalande AI dygnet runt', body: 'Naturlig svenska som förstår kundens ärende, bokar tider och tar meddelanden.' },
  { icon: '⭐', title: 'Fler Google-recensioner automatiskt', body: 'Ett SMS går ut efter avslutat jobb. Nöjda kunder hamnar på Google, missnöjda hos er.' },
  { icon: '🚀', title: 'Igång på under en vecka', body: 'Vi sätter upp allt åt er. Ni behöver inte byta telefonsystem eller lära er något nytt.' },
]

export default function BenefitCards() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
      {BENEFITS.map(b => (
        <Panel key={b.title} padding="p-5" tiltMaxAngle={6}>
          <div style={{ fontSize: 26, marginBottom: 10 }}>{b.icon}</div>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: '#f6f3ee' }}>{b.title}</h3>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.55)', margin: 0 }}>{b.body}</p>
        </Panel>
      ))}
    </div>
  )
}
