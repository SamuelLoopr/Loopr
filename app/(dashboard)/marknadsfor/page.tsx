'use client'

import Panel from '@/app/components/Panel'

// ─── Content ──────────────────────────────────────────────────────────────────
const EARNINGS = [
  { referrals: 10,  monthly: 630 },
  { referrals: 50,  monthly: 3150 },
  { referrals: 100, monthly: 6300 },
  { referrals: 500, monthly: 31500 },
]

const STEPS = [
  { step: 1, title: 'Sign Up', description: 'Registrera dig som Loopr-partner på under en minut — ingen kostnad.' },
  { step: 2, title: 'Dela', description: 'Dela din unika länk med ditt nätverk, publik eller kunder.' },
  { step: 3, title: 'Tjäna', description: 'Få bonus och löpande provision för varje betalande kund du drar in.' },
]

const PERFECT_FOR = [
  { icon: '🎬', label: 'Agency YouTubers' },
  { icon: '📢', label: 'Marketing Influencers' },
  { icon: '💼', label: 'Online Business Creators' },
  { icon: '🚀', label: 'Entreprenörer' },
]

// ─── Page ───────────────────────────────────────────────────────────────────────
export default function MarknadsforPage() {
  return (
    <div className="space-y-6 pb-8">
      <Panel className="mb-2 inline-block" padding="px-5 py-3" enableTilt={false}>
        <p className="text-xs tracking-widest" style={{ color: 'var(--brick)' }}>LÄRANDE</p>
        <h1 className="text-3xl font-bold mt-1" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
          📣 Marknadsför
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Tjäna pengar på att rekommendera Loopr till ditt nätverk.</p>
      </Panel>

      {/* 2 big offer cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Panel padding="p-8" tiltMaxAngle={4}>
          <span className="text-4xl">💰</span>
          <h2 className="text-2xl font-bold mt-3" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--gold)' }}>
            500 kr Bonus
          </h2>
          <p className="text-sm mt-2" style={{ color: 'var(--slate)' }}>
            För var och en av dina 50 första signups — en engångsbonus utöver den löpande provisionen.
          </p>
        </Panel>
        <Panel padding="p-8" tiltMaxAngle={4}>
          <span className="text-4xl">🔁</span>
          <h2 className="text-2xl font-bold mt-3" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--brick)' }}>
            30% Löpande Provision
          </h2>
          <p className="text-sm mt-2" style={{ color: 'var(--slate)' }}>
            Så länge din referral förblir kund tjänar du 30% av deras prenumeration — varje månad.
          </p>
        </Panel>
      </div>

      {/* Earnings potential table */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--cream)' }}>Earnings Potential</h2>
        <Panel padding="p-0" className="overflow-hidden" enableTilt={false}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th className="px-5 py-3 text-left text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--slate)' }}>
                  Referrals
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--slate)' }}>
                  Månatlig intäkt
                </th>
              </tr>
            </thead>
            <tbody>
              {EARNINGS.map((row, i) => (
                <tr key={row.referrals} style={{ borderBottom: i < EARNINGS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <td className="px-5 py-3 font-medium" style={{ color: 'var(--cream)' }}>{row.referrals} referrals</td>
                  <td className="px-5 py-3 font-semibold" style={{ color: 'var(--gold)' }}>{row.monthly.toLocaleString('sv-SE')} kr/mån</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      {/* How it works */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--cream)' }}>How It Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {STEPS.map(s => (
            <Panel key={s.step} padding="p-5" className="flex flex-col gap-2" tiltMaxAngle={6}>
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ backgroundColor: 'rgba(168,85,247,0.15)', color: 'var(--brick)', border: '1px solid rgba(168,85,247,0.3)' }}
              >
                {s.step}
              </span>
              <h3 className="font-semibold text-sm mt-1" style={{ color: 'var(--cream)' }}>{s.title}</h3>
              <p className="text-xs" style={{ color: 'var(--slate)' }}>{s.description}</p>
            </Panel>
          ))}
        </div>
      </div>

      {/* Perfect for */}
      <div>
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--cream)' }}>Perfect For</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {PERFECT_FOR.map(p => (
            <Panel key={p.label} padding="p-4" className="flex items-center gap-3" enableTilt={false}>
              <span className="text-xl">{p.icon}</span>
              <span className="text-sm font-medium" style={{ color: 'var(--cream)' }}>{p.label}</span>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  )
}
