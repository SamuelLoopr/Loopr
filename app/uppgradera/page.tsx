'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { describeReason, TRIAL_DAYS, type AccessReason } from '@/lib/subscription'

// Where the paywall sends a signed-in account without an active subscription.
//
// Deliberately NOT in PROTECTED_PAGES: the paywall redirects here, so gating it
// behind the paywall would bounce it to itself. It still only shows anything
// useful to someone with a session, and it exposes no account data beyond the
// signed-in user's own email.
//
// No payment provider is connected yet, so the call to action is a mailto
// rather than a checkout button. When Stripe lands, this button becomes the
// checkout link and nothing else on the page has to change.

const SALES_EMAIL = 'support@tryloopr.se'

const PLAN_POINTS = [
  'AI-receptionist som svarar dygnet runt på svenska',
  'Lead Finder med ICP-poängsättning och sökhistorik',
  'CRM, Cold Call-station och pipeline',
  'Master Demo och delbara kunddemos',
  'Recensionsautomation och förslagsverktyg',
]

function UpgradeBody() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reason = (searchParams.get('reason') ?? 'inactive') as AccessReason

  const [email, setEmail] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setEmail(data.user?.email ?? '')
    })
    return () => { cancelled = true }
  }, [])

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  const explanation = describeReason(reason)

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 520,
        padding: '34px 30px',
        borderRadius: 20,
        backgroundColor: 'rgba(21,19,19,0.78)',
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
      }}
    >
      <p style={{ fontSize: 11, letterSpacing: '0.16em', color: '#A855F7', margin: 0 }}>KONTO</p>
      <h1
        style={{
          fontSize: 25,
          fontWeight: 700,
          margin: '10px 0 8px',
          color: 'var(--cream)',
          fontFamily: 'Arial, Helvetica, sans-serif',
          lineHeight: 1.2,
        }}
      >
        Uppgradera för att fortsätta
      </h1>

      {explanation && (
        <p style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.6)', margin: '0 0 6px' }}>
          {explanation}
        </p>
      )}
      <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
        Dashboarden är låst tills kontot har en aktiv prenumeration. Din data ligger kvar
        orörd och blir tillgänglig igen direkt när kontot aktiveras.
      </p>

      <ul style={{ listStyle: 'none', padding: 0, margin: '22px 0' }}>
        {PLAN_POINTS.map(p => (
          <li
            key={p}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              fontSize: 13.5,
              lineHeight: 1.5,
              color: 'rgba(255,255,255,0.7)',
              marginBottom: 9,
            }}
          >
            <span style={{ color: '#A855F7', flexShrink: 0 }} aria-hidden="true">✓</span>
            {p}
          </li>
        ))}
      </ul>

      <a
        href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent('Aktivera mitt Loopr-konto')}&body=${encodeURIComponent(`Jag vill aktivera kontot ${email || '(din e-post)'}.`)}`}
        style={{
          display: 'block',
          textAlign: 'center',
          padding: '13px 20px',
          borderRadius: 14,
          fontSize: 15,
          fontWeight: 700,
          color: '#fff',
          textDecoration: 'none',
          background: 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)',
        }}
      >
        Aktivera kontot
      </a>

      <p style={{ fontSize: 11.5, textAlign: 'center', color: 'rgba(255,255,255,0.3)', margin: '10px 0 0' }}>
        Nya konton får {TRIAL_DAYS} dagars provperiod automatiskt.
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginTop: 22,
          paddingTop: 16,
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          {email && (
            <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)', margin: 0 }} title={email}>
              Inloggad som {email}
            </p>
          )}
          <Link href="/profile" style={{ fontSize: 12, color: 'var(--slate)' }}>
            Till din profil
          </Link>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '7px 13px',
            borderRadius: 10,
            color: 'var(--cream)',
            backgroundColor: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.14)',
            cursor: signingOut ? 'default' : 'pointer',
            opacity: signingOut ? 0.6 : 1,
          }}
        >
          {signingOut ? 'Loggar ut…' : '⏻ Logga ut'}
        </button>
      </div>
    </div>
  )
}

export default function UpgradePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <Suspense
        fallback={
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Laddar…</p>
        }
      >
        <UpgradeBody />
      </Suspense>
    </main>
  )
}
