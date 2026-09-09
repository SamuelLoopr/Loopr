import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Server-side Supabase clients. Two of them, for two different jobs.

/**
 * Acts as the signed-in user: reads the session from the request cookies, so
 * RLS sees `authenticated` and `auth.uid()`. Use this in server components and
 * in route handlers that act on behalf of whoever is logged in.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server components may not set cookies. middleware.ts refreshes
            // the session on every protected request, so this is safe to skip.
          }
        },
      },
    }
  )
}

/**
 * Acts as the backend itself, for the handful of routes that legitimately serve
 * people with no session: the public share links (/api/public-agent/*), the
 * landing-page voice demo, the Twilio incoming-call webhook and the per-agent
 * inbound webhook.
 *
 * Those routes run on the server but have always used NEXT_PUBLIC_SUPABASE_ANON_KEY
 * — the same key that ships to every browser. That is why `agents` cannot simply
 * be closed to the anon role: doing so would break live customer demos, and
 * leaving it open means anyone holding the public key can read prompt_text
 * straight from PostgREST.
 *
 * SUPABASE_SERVICE_ROLE_KEY fixes that. It never leaves the server, bypasses RLS,
 * and lets the anon role be revoked entirely (part B of 019_auth_rls.sql).
 * Until it is set we fall back to the anon key so nothing breaks today — the
 * app keeps working exactly as before, just without the extra lockdown.
 */
export function createSupabaseServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

/** True when the service-role key is configured, i.e. part B of the RLS migration is safe to apply. */
export const hasServiceRoleKey = () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
