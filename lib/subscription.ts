// Whether an account may use the paid parts of the dashboard.
//
// Kept as a pure function so the rule lives in one place and can be reasoned
// about (and tested) without a database or a request. middleware.ts calls it on
// every protected request; the Profil page calls it to describe the current
// state back to the user.
//
// No payment provider is connected. subscription_status is written by hand for
// now, using Stripe's own vocabulary so a webhook can later write the column
// directly without a translation layer.

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'inactive'

export interface BillingProfile {
  subscription_status: string | null
  trial_ends_at: string | null
  billing_bypass: boolean | null
}

export type AccessReason =
  | 'bypass'
  | 'active'
  | 'trialing'
  | 'trial_expired'
  | 'past_due'
  | 'canceled'
  | 'inactive'
  | 'unknown'

export interface AccessDecision {
  allowed: boolean
  reason: AccessReason
  /** Days left in the trial, when one is running. Negative values are never returned. */
  trialDaysLeft?: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Length of the automatic trial a brand-new account gets on first sign-in. */
export const TRIAL_DAYS = 14

export function trialEndsAtFromNow(now: Date = new Date()): string {
  return new Date(now.getTime() + TRIAL_DAYS * DAY_MS).toISOString()
}

/**
 * The single access rule.
 *
 * A missing profile row is NOT decided here — middleware creates one first and
 * calls this with the result, so "no row" never reaches this function.
 */
export function evaluateAccess(
  profile: BillingProfile | null,
  now: Date = new Date()
): AccessDecision {
  if (!profile) return { allowed: false, reason: 'unknown' }

  // The manual override wins over everything, including an expired trial.
  if (profile.billing_bypass === true) return { allowed: true, reason: 'bypass' }

  const status = (profile.subscription_status ?? '').trim().toLowerCase()

  if (status === 'active') return { allowed: true, reason: 'active' }

  if (status === 'trialing') {
    // A null end date is treated as expired rather than infinite: failing
    // closed on a half-written row is safer than granting free access forever.
    if (!profile.trial_ends_at) return { allowed: false, reason: 'trial_expired' }

    const ends = new Date(profile.trial_ends_at)
    if (Number.isNaN(ends.getTime())) return { allowed: false, reason: 'trial_expired' }
    if (ends.getTime() <= now.getTime()) return { allowed: false, reason: 'trial_expired' }

    return {
      allowed: true,
      reason: 'trialing',
      trialDaysLeft: Math.max(0, Math.ceil((ends.getTime() - now.getTime()) / DAY_MS)),
    }
  }

  if (status === 'past_due') return { allowed: false, reason: 'past_due' }
  if (status === 'canceled') return { allowed: false, reason: 'canceled' }
  if (status === 'inactive') return { allowed: false, reason: 'inactive' }

  // An unrecognised status is a bug or a provider value we have not mapped yet.
  // Deny rather than guess — a wrong "allow" here gives the product away.
  return { allowed: false, reason: 'unknown' }
}

/** Short Swedish explanation for the upgrade page. */
export function describeReason(reason: AccessReason): string {
  switch (reason) {
    case 'trial_expired':
      return 'Din provperiod har tagit slut.'
    case 'past_due':
      return 'Det finns en obetald faktura på kontot.'
    case 'canceled':
      return 'Prenumerationen är avslutad.'
    case 'inactive':
      return 'Kontot har ingen aktiv prenumeration.'
    case 'unknown':
      return 'Kontots betalstatus kunde inte avgöras.'
    default:
      return ''
  }
}
