'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Shows who is signed in and lets them sign out. Sits at the bottom of the
// dashboard sidebar, under the Profile link.
//
// signOut() clears the auth cookies (the client is cookie-backed, see
// lib/supabase.ts), so the very next request fails the middleware check and the
// dashboard is closed again. refresh() drops the server-rendered pages that were
// cached for the signed-in user.
export default function SignOutButton() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setEmail(data.user?.email ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSignOut() {
    setBusy(true)
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <div>
      {email && (
        <p
          className="px-3 text-[11px] truncate"
          style={{ color: 'var(--slate)', marginBottom: 6 }}
          title={email}
        >
          {email}
        </p>
      )}
      <button
        type="button"
        onClick={handleSignOut}
        disabled={busy}
        className="flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
        style={{
          color: 'var(--slate)',
          backgroundColor: 'transparent',
          borderLeft: '2px solid transparent',
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--cream)'
          e.currentTarget.style.backgroundColor = 'rgba(168,85,247,0.12)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--slate)'
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        <span className="text-base leading-none">⏻</span>
        <span>{busy ? 'Loggar ut…' : 'Logga ut'}</span>
      </button>
    </div>
  )
}
