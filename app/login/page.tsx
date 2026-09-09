'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import LooprLogo from '@/app/components/LooprLogo'

// Sign-in page for the dashboard. Public by design — middleware.ts does not
// gate it, otherwise there would be nowhere to log in from.
//
// Accounts are created in the Supabase dashboard (Authentication → Users), not
// here: there is deliberately no public sign-up, since the dashboard is meant
// for the owner and a handful of approved people.

/** Supabase returns these in English; map the ones a real person will hit. */
function translateAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) {
    return 'Fel e-post eller lösenord.'
  }
  if (m.includes('email not confirmed')) {
    return 'E-postadressen är inte bekräftad ännu. Bekräfta den via länken i mejlet, eller markera användaren som bekräftad i Supabase.'
  }
  if (m.includes('too many requests') || m.includes('rate limit')) {
    return 'För många försök. Vänta en stund och prova igen.'
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Kunde inte nå servern. Kontrollera din uppkoppling.'
  }
  return message
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Where the middleware wanted to send the user before it bounced them here.
  // Only relative paths are accepted, so a crafted ?next=https://evil.example
  // cannot turn this into an open redirect.
  const rawNext = searchParams.get('next')
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Set by middleware.ts when a valid account is not on DASHBOARD_ALLOWED_EMAILS.
  const denied = searchParams.get('denied') === '1'

  const [error, setError] = useState<string | null>(
    denied ? 'Kontot har inte behörighet till dashboarden. Kontakta administratören.' : null
  )
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    let cancelled = false

    // A denied account is signed in but not allowed through. Sign it out here,
    // otherwise the "already signed in" redirect below would bounce it straight
    // back into the middleware and loop.
    if (denied) {
      supabase.auth
        .getSession()
        // Only sign out when there is something to sign out of. Hitting
        // /login?denied=1 with no session would otherwise fire a pointless
        // logout request that just errors in the console.
        .then(({ data }) => (data.session ? supabase.auth.signOut() : null))
        .catch(() => null)
        .finally(() => {
          if (!cancelled) setCheckingSession(false)
        })
      return () => {
        cancelled = true
      }
    }

    // Already signed in? Don't make them log in twice.
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      if (data.user) {
        router.replace(next)
        return
      }
      setCheckingSession(false)
    })
    return () => {
      cancelled = true
    }
  }, [router, next, denied])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      setError(translateAuthError(signInError.message))
      setLoading(false)
      return
    }

    // refresh() re-runs the middleware with the cookies that were just set, so
    // the dashboard renders as the signed-in user instead of bouncing back.
    router.replace(next)
    router.refresh()
  }

  const field: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    color: 'var(--cream)',
    fontSize: 15,
    outline: 'none',
  }

  const label: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.04em',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 7,
  }

  if (checkingSession) {
    return (
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center' }}>
        Kontrollerar session…
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ marginBottom: 16 }}>
        <label htmlFor="email" style={label}>
          E-POST
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="du@företag.se"
          style={field}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--brick)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)')}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label htmlFor="password" style={label}>
          LÖSENORD
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          style={field}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--brick)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)')}
        />
      </div>

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            padding: '11px 13px',
            borderRadius: 10,
            fontSize: 13.5,
            lineHeight: 1.5,
            color: '#fecaca',
            backgroundColor: 'rgba(248,113,113,0.1)',
            border: '1px solid rgba(248,113,113,0.28)',
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          width: '100%',
          padding: '13px 20px',
          borderRadius: 14,
          border: 'none',
          fontSize: 15,
          fontWeight: 700,
          color: '#fff',
          cursor: loading ? 'default' : 'pointer',
          opacity: loading ? 0.6 : 1,
          background: 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)',
          transition: 'opacity 0.2s, transform 0.2s',
        }}
      >
        {loading ? 'Loggar in…' : 'Logga in'}
      </button>
    </form>
  )
}

export default function LoginPage() {
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
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          padding: '34px 30px',
          borderRadius: 20,
          backgroundColor: 'rgba(21,19,19,0.78)',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ marginBottom: 26 }}>
          <LooprLogo size="md" />
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              margin: '18px 0 6px',
              color: 'var(--cream)',
              fontFamily: 'Arial, Helvetica, sans-serif',
            }}
          >
            Logga in
          </h1>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
            Dashboarden är privat. Logga in med kontot du fått tilldelat.
          </p>
        </div>

        <Suspense
          fallback={
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center' }}>
              Laddar…
            </p>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
