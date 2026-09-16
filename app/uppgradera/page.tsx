'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { describeReason, TRIAL_DAYS, type AccessReason } from '@/lib/subscription'

// Where the paywall sends a signed-in account without an active subscription.
//
// Deliberately NOT in PROTECTED_PAGES: the paywall redirects here, so gating it
// behind the paywall would bounce it to itself.
//
// ── ON THE LIMITS SHOWN BELOW ─────────────────────────────────────────────────
// These are sold but NOT enforced. Enforcing a per-operator cap needs the data
// to be attributable to an operator, and most of it is not: agents, leads,
// review_clients, proposals, audits, call_logs and speed_to_lead_agents have no
// owner column at all, and lead_searches/scrape_usage key on a localStorage
// device id rather than an auth uid. Adding ownership is its own piece of work.
//
// Loopr is sold to operators who resell to local businesses, so every limit is
// counted in how many client instances an operator can run at once — not in how
// much any one end customer may use.

const SALES_EMAIL = 'support@tryloopr.se'

type PlanId = 'basic' | 'pro' | 'business'

interface Plan {
  id: PlanId
  name: string
  tagline: string
  price: string
  period: string
  features: string[]
  popular?: boolean
}

const PLANS: Plan[] = [
  {
    id: 'basic',
    name: 'Basic',
    tagline: 'Grundläggande verktyg',
    price: '499 kr',
    period: '/mån',
    features: [
      '3 aktiva klienter/agenter',
      '500 lead-resultat per månad',
      '1 Business Operating System',
      'CRM, Cold Call och pipeline',
      'Support via e-post',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Allt i Basic + fler klienter och AI-agenter',
    price: '1 499 kr',
    period: '/mån',
    popular: true,
    features: [
      '15 aktiva klienter/agenter',
      '2 000 lead-resultat per månad',
      '5 Business Operating Systems',
      'Master Demo och delbara kunddemos',
      'Recensionsautomation',
      'Prioriterad support',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    tagline: 'Hela plattformen + prioriterad support',
    price: '3 999 kr',
    period: '/mån',
    features: [
      'Obegränsat antal klienter/agenter',
      '10 000 lead-resultat per månad',
      'Obegränsat antal Business Operating Systems',
      'Alla moduler utan begränsning',
      'Prioriterad support',
      'Onboarding och uppsättning',
    ],
  },
]

function PlanCard({
  plan,
  email,
  onChoose,
  busy,
}: {
  plan: Plan
  email: string
  onChoose: (id: PlanId) => void
  busy: PlanId | null
}) {
  const isBusy = busy === plan.id

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: plan.popular ? '26px 22px' : '22px',
        borderRadius: 18,
        backgroundColor: plan.popular ? 'rgba(168,85,247,0.08)' : 'rgba(21,19,19,0.7)',
        border: `1px solid ${plan.popular ? 'rgba(168,85,247,0.45)' : 'rgba(255,255,255,0.1)'}`,
        boxShadow: plan.popular ? '0 18px 44px rgba(168,85,247,0.16)' : 'none',
        position: 'relative',
      }}
    >
      {plan.popular && (
        <span
          style={{
            position: 'absolute',
            top: -11,
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            padding: '4px 12px',
            borderRadius: 999,
            whiteSpace: 'nowrap',
            color: '#fff',
            background: 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)',
          }}
        >
          POPULÄRAST
        </span>
      )}

      <p style={{ fontSize: 11, letterSpacing: '0.14em', color: '#A855F7', margin: 0 }}>
        {plan.name.toUpperCase()}
      </p>
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '6px 0 14px', lineHeight: 1.45, minHeight: 36 }}>
        {plan.tagline}
      </p>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 18 }}>
        <span
          style={{
            fontSize: 30,
            fontWeight: 700,
            color: 'var(--cream)',
            fontFamily: 'Arial, Helvetica, sans-serif',
          }}
        >
          {plan.price}
        </span>
        <span style={{ fontSize: 13, color: 'var(--slate)' }}>{plan.period}</span>
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', flex: 1 }}>
        {plan.features.map(f => (
          <li
            key={f}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 9,
              fontSize: 13,
              lineHeight: 1.5,
              color: 'rgba(255,255,255,0.68)',
              marginBottom: 9,
            }}
          >
            <span style={{ color: '#A855F7', flexShrink: 0 }} aria-hidden="true">✓</span>
            {f}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => onChoose(plan.id)}
        disabled={isBusy}
        style={{
          width: '100%',
          padding: '12px 18px',
          borderRadius: 13,
          fontSize: 14.5,
          fontWeight: 700,
          cursor: isBusy ? 'default' : 'pointer',
          opacity: isBusy ? 0.6 : 1,
          color: plan.popular ? '#fff' : '#A855F7',
          background: plan.popular
            ? 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)'
            : 'rgba(168,85,247,0.12)',
          border: plan.popular ? 'none' : '1px solid rgba(168,85,247,0.35)',
        }}
        title={email ? `Välj ${plan.name} för ${email}` : `Välj ${plan.name}`}
      >
        {isBusy ? 'Öppnar…' : 'Välj →'}
      </button>
    </div>
  )
}

function UpgradeBody() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reason = (searchParams.get('reason') ?? 'inactive') as AccessReason

  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [chosen, setChosen] = useState<PlanId | null>(null)
  const [busy, setBusy] = useState<PlanId | null>(null)
  const [saveError, setSaveError] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return
      setEmail(data.user.email ?? '')
      setUserId(data.user.id)
    })
    return () => { cancelled = true }
  }, [])

  async function handleChoose(id: PlanId) {
    setBusy(id)
    setSaveError('')

    // Record the choice so it is known which tier this operator wants before any
    // money changes hands — that is what tells you which checkout to send them
    // to once Stripe exists. Failing to save must not block the enquiry.
    if (userId) {
      const { error } = await supabase
        .from('profile')
        .upsert({ user_id: userId, subscription_plan: id }, { onConflict: 'user_id' })
      if (error) {
        setSaveError(
          error.code === 'PGRST204'
            ? 'Valet kunde inte sparas — kör migration 026_subscription_plan.sql. Din förfrågan skickas ändå.'
            : `Valet kunde inte sparas: ${error.message}`
        )
      } else {
        setChosen(id)
      }
    }

    // ───────────────────────────────────────────────────────────────────────
    // STRIPE GOES HERE.
    // Replace everything below with a call to a server route that creates a
    // Checkout Session for `id` and redirects to session.url. The plan is
    // already persisted above, and subscription_status (025) is already written
    // in Stripe's own vocabulary, so the webhook can set it directly — nothing
    // else on this page has to change.
    // ───────────────────────────────────────────────────────────────────────
    const plan = PLANS.find(p => p.id === id)!
    const subject = `Aktivera Loopr – ${plan.name} (${plan.price}${plan.period})`
    const body = `Jag vill aktivera kontot ${email || '(din e-post)'} på plannivå ${plan.name}.`
    window.location.href =
      `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

    setBusy(null)
  }

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  const explanation = describeReason(reason)

  return (
    <div style={{ width: '100%', maxWidth: 1040 }}>
      <div style={{ textAlign: 'center', marginBottom: 30 }}>
        <p style={{ fontSize: 11, letterSpacing: '0.16em', color: '#A855F7', margin: 0 }}>KONTO</p>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            margin: '10px 0 10px',
            color: 'var(--cream)',
            fontFamily: 'Arial, Helvetica, sans-serif',
            lineHeight: 1.15,
          }}
        >
          Lås upp ditt konto
        </h1>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.6,
            color: 'rgba(255,255,255,0.5)',
            margin: '0 auto',
            maxWidth: 540,
          }}
        >
          Välj en betalplan för att aktivera ditt konto och få tillgång till Loopr-plattformen.
        </p>
        {explanation && (
          <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.4)', marginTop: 12 }}>
            {explanation} Din data ligger kvar orörd och blir tillgänglig igen direkt när kontot aktiveras.
          </p>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
          gap: 18,
          alignItems: 'stretch',
        }}
      >
        {PLANS.map(p => (
          <PlanCard key={p.id} plan={p} email={email} onChoose={handleChoose} busy={busy} />
        ))}
      </div>

      {saveError && (
        <p style={{ fontSize: 12.5, color: '#fbbf24', textAlign: 'center', marginTop: 16 }}>
          ⚠️ {saveError}
        </p>
      )}
      {chosen && !saveError && (
        <p style={{ fontSize: 12.5, color: '#4ade80', textAlign: 'center', marginTop: 16 }}>
          ✓ {PLANS.find(p => p.id === chosen)!.name} registrerad på kontot. Vi aktiverar det så snart betalningen är på plats.
        </p>
      )}

      <p style={{ fontSize: 11.5, textAlign: 'center', color: 'rgba(255,255,255,0.28)', margin: '18px 0 0' }}>
        Priser exklusive moms. Nya konton får {TRIAL_DAYS} dagars provperiod automatiskt.
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          flexWrap: 'wrap',
          marginTop: 26,
          paddingTop: 18,
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {email && (
          <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.32)' }} title={email}>
            Inloggad som {email}
          </span>
        )}
        <Link href="/profile" style={{ fontSize: 12, color: 'var(--slate)' }}>
          Till din profil
        </Link>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: '6px 12px',
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
        padding: '40px 16px',
      }}
    >
      <Suspense fallback={<p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Laddar…</p>}>
        <UpgradeBody />
      </Suspense>
    </main>
  )
}
