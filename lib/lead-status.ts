// The one definition of a lead's status.
//
// These slugs are what the CRM has always written and what the 17 rows in the
// live database actually contain, so they are the source of truth. Three other
// spellings had drifted in alongside them:
//   - the dashboard counted English keys (contacted/meeting/proposal/won/lost),
//     which matched nothing, so five of six pipeline steps and the "Möten" card
//     read 0 while real leads sat in every one of them;
//   - Cold Call wrote 'Möte'/'Kontaktad' (capitalised, with diacritics);
//   - Cold Call's queue filter excluded '("Möte","Förlorad","booked")'.
//
// Everything that reads or writes leads.status imports from here so the four
// spellings cannot drift apart again.

export interface LeadStatus {
  /** Stored in leads.status. Never change these without migrating the rows. */
  value: string
  label: string
  color: string
}

export const LEAD_STATUSES: LeadStatus[] = [
  { value: 'new',          label: 'Ny',           color: 'var(--slate)' },
  { value: 'att_kontakta', label: 'Att Kontakta', color: '#60a5fa' },
  { value: 'kontaktad',    label: 'Kontaktad',    color: 'var(--gold)' },
  { value: 'mote',         label: 'Möte',         color: 'var(--brick)' },
  { value: 'forslag',      label: 'Förslag',      color: '#a78bfa' },
  { value: 'vunnen',       label: 'Vunnen',       color: '#4ade80' },
  { value: 'forlorad',     label: 'Förlorad',     color: '#ef4444' },
]

/** Named constants for the statuses code writes or filters on directly. */
export const LEAD_STATUS = {
  NEW: 'new',
  ATT_KONTAKTA: 'att_kontakta',
  KONTAKTAD: 'kontaktad',
  MOTE: 'mote',
  FORSLAG: 'forslag',
  VUNNEN: 'vunnen',
  FORLORAD: 'forlorad',
} as const

/**
 * Statuses a lead should no longer appear in the Cold Call queue under —
 * a meeting is already booked, or the lead is dead. Mirrors the intent of the
 * original '("Möte","Förlorad","booked")' filter, which matched no real rows.
 */
export const COLD_CALL_EXCLUDED_STATUSES: string[] = [LEAD_STATUS.MOTE, LEAD_STATUS.FORLORAD]
