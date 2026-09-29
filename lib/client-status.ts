// The follow-up status a client sets on their own calls, on the public BOS page
// (/master/[shareId]). Shared by the write route that validates it and the page
// that renders it, so the two can never disagree about what a valid status is.
//
// Deliberately free of imports so it can be unit-tested with plain `node`.

export const CLIENT_STATUSES = ['ny', 'kontaktad', 'offert_skickad', 'bokad', 'avslutad'] as const

export type ClientStatus = (typeof CLIENT_STATUSES)[number]

export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  ny: 'Ny',
  kontaktad: 'Kontaktad',
  offert_skickad: 'Offert skickad',
  bokad: 'Bokad',
  avslutad: 'Avslutad',
}

/**
 * The minimal CRM on the page groups calls by status. Four groups over five
 * statuses: "Bokad" and "Avslutad" are both done as far as following up goes.
 */
export const CRM_GROUPS: { key: string; label: string; statuses: readonly ClientStatus[] }[] = [
  { key: 'nya', label: 'Nya samtal', statuses: ['ny'] },
  { key: 'vantar', label: 'Väntar på återkoppling', statuses: ['kontaktad'] },
  { key: 'offert', label: 'Offert skickad', statuses: ['offert_skickad'] },
  { key: 'klart', label: 'Klart', statuses: ['bokad', 'avslutad'] },
]

/** Longest note a client can save — enforced by the route and by the database. */
export const CLIENT_NOTE_MAX = 2000

export function isClientStatus(value: unknown): value is ClientStatus {
  return typeof value === 'string' && (CLIENT_STATUSES as readonly string[]).includes(value)
}

/** A row with no status yet has simply not been touched: that is "Ny". */
export function clientStatusOf(value: unknown): ClientStatus {
  return isClientStatus(value) ? value : 'ny'
}
