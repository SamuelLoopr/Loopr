import { createBrowserClient } from '@supabase/ssr'

// Browser-side Supabase client, shared by every client component in the app.
//
// This is @supabase/ssr's createBrowserClient rather than supabase-js's plain
// createClient because the session has to live in cookies, not localStorage.
// middleware.ts only ever sees cookies — with a localStorage session a signed-in
// user would still look anonymous to the middleware and every dashboard request
// would bounce straight back to /login.
//
// Because the export keeps the same name and shape, the dashboard pages that
// already `import { supabase } from '@/lib/supabase'` start sending the logged-in
// user's JWT automatically, which is what makes the `authenticated`-only RLS
// policies in 019_auth_rls.sql work without touching those pages.
//
// The public share pages (audit/demo/forslag) import this too. With no session
// it simply sends the anon key, which is what the narrow anon policies in that
// same migration are scoped for.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
