// Who counts as an admin of this dashboard.
//
// Shared by middleware.ts (the gate in front of every protected route) and by
// the route handlers that need to make the same decision on their own. Keeping
// one implementation means the gate and the handlers cannot drift apart and
// disagree about who is allowed in.

/**
 * True when `email` may use the dashboard.
 *
 * An empty or unset DASHBOARD_ALLOWED_EMAILS means "any confirmed Supabase
 * user", which is only safe while public signups are disabled in Supabase —
 * the same posture the rest of the dashboard already runs under. Set the
 * variable to pin access to named addresses regardless of that setting.
 */
export function isAllowedEmail(email: string | undefined | null): boolean {
  const raw = process.env.DASHBOARD_ALLOWED_EMAILS?.trim()
  if (!raw) return true

  const allowed = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (allowed.length === 0) return true

  return Boolean(email && allowed.includes(email.toLowerCase()))
}
