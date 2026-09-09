import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

// Optional allow-list, second line of defence behind Supabase's own signup
// setting. Comma-separated emails in DASHBOARD_ALLOWED_EMAILS; when unset, any
// confirmed Supabase user may in. Set it and only those addresses get through,
// so a stray self-registered account cannot reach the dashboard even if public
// signups are ever switched back on.
function isAllowed(email: string | undefined): boolean {
  const raw = process.env.DASHBOARD_ALLOWED_EMAILS?.trim()
  if (!raw) return true
  const allowed = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (allowed.length === 0) return true
  return Boolean(email && allowed.includes(email.toLowerCase()))
}

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
  if (!isAllowed(user.email)) {
    if (isProtectedApi) {
      return NextResponse.json({ error: 'Kontot saknar behörighet.' }, { status: 403 })
    }
    const deniedUrl = request.nextUrl.clone()
    deniedUrl.pathname = '/login'
    deniedUrl.search = ''
    deniedUrl.searchParams.set('denied', '1')
    return NextResponse.redirect(deniedUrl)
  }

  return response
}

export const config = {
  // Skip static assets and image files; everything else reaches the function,
  // which then early-returns for public routes.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
