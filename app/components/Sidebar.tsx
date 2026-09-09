'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LooprLogo from './LooprLogo'

interface NavItem {
  label: string
  href: string
  icon: string
}

interface NavGroup {
  heading?: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    items: [{ label: 'Dashboard', href: '/dashboard', icon: '◈' }],
  },
  {
    heading: 'SÄLJPIPELINE',
    items: [
      { label: 'Lead Finder', href: '/lead-finder', icon: '🔍' },
      { label: 'Master Demo', href: '/master-demo', icon: '🖥' },
      { label: 'CRM', href: '/crm', icon: '📋' },
      { label: 'Klienter', href: '/clients', icon: '🏢' },
      { label: 'Cold Call', href: '/cold-call', icon: '📞' },
      { label: 'Bokade Möten', href: '/booked-meetings', icon: '📅' },
    ],
  },
  {
    heading: 'AI & AUTOMATION',
    items: [
      { label: 'AI Agenter', href: '/ai-agents', icon: '🤖' },
      { label: 'One Click BOS', href: '/speed-to-lead', icon: '⚡' },
    ],
  },
  {
    heading: 'AFFÄR',
    items: [
      { label: 'Förslag', href: '/proposals', icon: '📄' },
      { label: 'Skicka Betalningar', href: '/skicka-betalningar', icon: '💳' },
      { label: 'Köp Minuter', href: '/kop-minuter', icon: '⏱' },
    ],
  },
  {
    heading: 'LÄRANDE',
    items: [
      { label: 'Utbildning', href: '/utbildning', icon: '🎓' },
      { label: 'Community', href: '/community', icon: '👥' },
      { label: 'Marknadsför', href: '/marknadsfor', icon: '📣' },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="flex flex-col h-full w-64 shrink-0 py-6 px-3 overflow-y-auto"
      style={{
        backgroundColor: 'rgba(21,19,19,0.85)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Logo */}
      <div className="px-3 mb-8">
        <LooprLogo size="md" />
        <div className="text-xs mt-1.5" style={{ color: 'var(--slate)' }}>
          AI-receptionist & recensioner
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-6">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {group.heading && (
              <p
                className="text-[10px] font-semibold tracking-widest px-3 mb-2"
                style={{ color: 'var(--slate)' }}
              >
                {group.heading}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
                      style={{
                        color: active ? 'var(--cream)' : 'var(--slate)',
                        backgroundColor: active ? 'rgba(168,85,247,0.2)' : 'transparent',
                        borderLeft: active ? '2px solid var(--brick)' : '2px solid transparent',
                      }}
                    >
                      <span className="text-base leading-none">{item.icon}</span>
                      <span>{item.label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Profile link at bottom */}
      <div className="mt-6 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <Link
          href="/profile"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
          style={{
            color: pathname === '/profile' ? 'var(--cream)' : 'var(--slate)',
            backgroundColor: pathname === '/profile' ? 'rgba(168,85,247,0.2)' : 'transparent',
            borderLeft: pathname === '/profile' ? '2px solid var(--brick)' : '2px solid transparent',
          }}
        >
          <span className="text-base leading-none">👤</span>
          <span>Profil</span>
        </Link>
      </div>
    </aside>
  )
}
