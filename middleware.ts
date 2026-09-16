import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAllowedEmail } from '@/lib/admin'
import {
  evaluateAccess,
  trialEndsAtFromNow,
  type BillingProfile,
} from '@/lib/subscription'

// Session gate for the dashboard.
//
// Everything under the (dashboard) route group requires a Supabase session; the
// public marketing pages and the customer-facing share links stay completely
// untouched. The (dashboard) group is invisible in URLs, so the paths are listed
// explicitly below rather than inferred.

/** Pages under app/(dashboard). Kept in sync with the folders in that group. */
const PROTECTED_PAGES = [
  '/ai-agents',
  '/ai-audit-maker',
  '/booked-meetings',
  '/clients',
  '/cold-call',
  '/community',
  '/crm',
  '/dashboard',
  '/kop-minuter',
  '/lead-finder',
  '/marknadsfor',
  '/master-demo',
  '/profile',
  '/proposals',
  '/review-automation',
  '/skicka-betalningar',
  '/speed-to-lead',
  '/utbildning',
]

// API routes only ever called from dashboard pages. These are the ones that
// spend money or reach into the account — Anthropic and Google Places credits,
// ElevenLabs voice imports, and Twilio number purchases — so leaving them open
// while gating the UI would only hide the problem, not fix it.
//
// Deliberately NOT listed, because non-dashboard callers depend on them:
//   /api/public-agent/*        public share links (/prova, /master)
//   /api/loopr-demo/voice      the voice demo on the public /om-loopr page
//   /api/twilio/incoming-call  Twilio's webhook for live inbound calls
//   /api/webhooks/[token]      inbound call data, authenticated by its own token
//   /api/cal-com/*             reachable as ElevenLabs agent tools during a live
//                              call, so a session check would break booking
const PROTECTED_API = [
  // Admin-only lookups used by otherwise-public pages. These must stay gated:
  // /api/admin/agent-by-share resolves an agent's internal id, which the public
  // master-demo payload deliberately never exposes.
  '/api/admin',
  '/api/ai-fix',
  '/api/airtable',
  '/api/create-conversation',
  '/api/elevenlabs',
  '/api/generate-agent-prompt',
  '/api/generate-audit',
  '/api/generate-icp',
  '/api/search-leads',
  '/api/twilio/purchase-number',
  '/api/twilio/release-number',
  '/api/twilio/search-numbers',
  '/api/webhooks/generate',
]

// Protected, but exempt from the paywall. A blocked account still needs
// somewhere to land that is not a dead end: /profile shows their details and
// carries the sign-out button. /uppgradera is not listed here because it is not
// in PROTECTED_PAGES at all — putting the paywall's own destination behind the
// paywall would redirect it to itself.
const PAYWALL_EXEMPT = ['/profile']

/** Prefix match on whole path segments, so '/master-demo' never matches '/master/abc'. */
function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtectedPage = matchesPrefix(pathname, PROTECTED_PAGES)
  const isProtectedApi = matchesPrefix(pathname, PROTECTED_API)

  // Public route: hand it straight through, untouched and unslowed.
  if (!isProtectedPage && !isProtectedApi) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser(), not getSession(): this revalidates the JWT against Supabase Auth
  // instead of trusting whatever the cookie claims, so a forged or expired
  // cookie cannot walk past this check.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    if (isProtectedApi) {
      return NextResponse.json(
        { error: 'Inloggning krävs.' },
        { status: 401 }
      )
    }

    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    loginUrl.searchParams.set('next', pathname + request.nextUrl.search)

    const redirect = NextResponse.redirect(loginUrl)
    // Carry over any cookies Supabase refreshed while we were checking, so a
    // rotated refresh token isn't dropped on the floor by the redirect.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  // Signed in, but not on the allow-list.
  if (!isAllowedEmail(user.email)) {
    if (isProtectedApi) {
      return NextResponse.json({ error: 'Kontot saknar behörighet.' }, { status: 403 })
    }
    const deniedUrl = request.nextUrl.clone()
    deniedUrl.pathname = '/login'
    deniedUrl.search = ''
    deniedUrl.searchParams.set('denied', '1')
    return NextResponse.redirect(deniedUrl)
  }

  // ── Paywall ───────────────────────────────────────────────────────────────
  // Third and last gate, after "is there a session" and "is this account
  // allowed at all". Everything protected is behind it except /profile, which
  // stays reachable so a blocked account can still see its details and sign
  // out instead of being stuck with nowhere to go.
  if (matchesPrefix(pathname, PAYWALL_EXEMPT)) {
    return response
  }

  const { data: billing } = await supabase
    .from('profile')
    .select('subscription_status, trial_ends_at, billing_bypass')
    .eq('user_id', user.id)
    .maybeSingle()

  let profile = billing as BillingProfile | null

  // No row yet: this is a brand-new account, so start its trial rather than
  // turning it away. Existing accounts were backfilled as 'active' by
  // 025_subscription_paywall.sql, so this path only ever runs for genuine
  // sign-ups. Failing to write is not fatal — evaluateAccess still sees the
  // in-memory row and lets them in, and the next request retries the insert.
  if (!profile) {
    const fresh: BillingProfile = {
      subscription_status: 'trialing',
      trial_ends_at: trialEndsAtFromNow(),
      billing_bypass: false,
    }
    await supabase.from('profile').insert({ user_id: user.id, ...fresh })
    profile = fresh
  }

  const access = evaluateAccess(profile)

  if (!access.allowed) {
    if (isProtectedApi) {
      return NextResponse.json(
        { error: 'Kontot saknar aktiv prenumeration.', reason: access.reason },
        { status: 402 }
      )
    }
    const upgradeUrl = request.nextUrl.clone()
    upgradeUrl.pathname = '/uppgradera'
    upgradeUrl.search = ''
    upgradeUrl.searchParams.set('reason', access.reason)
    const redirect = NextResponse.redirect(upgradeUrl)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  return response
}

export const config = {
  // Skip static assets and image files; everything else reaches the function,
  // which then early-returns for public routes.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
