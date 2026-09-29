// The sections of the public client page (/master/[shareId]) and the switches
// that control them.
//
// One page, two builders: Master Demo (selling to a prospect) and Bygg BOS
// (running a client's day-to-day). Both read and write the same
// agents.master_sections, so both import this list — a section added here shows
// up in both, and the two can never disagree about what the switches mean.
//
// Stored as { [key]: boolean } in master_sections (migration 017). A missing key
// or a NULL column means "on": links made before a section existed keep showing
// whatever there is data for — see /api/public-agent/[shareId]/master.

export type SectionKey = 'calls' | 'voice' | 'sms' | 'audit' | 'proposal' | 'benefits'

export interface SectionDef {
  key: SectionKey
  icon: string
  label: string
  blurb: string
  /** Sections with no backing row — they can never be "missing data". */
  alwaysAvailable?: boolean
  /** Data that arrives on its own (real calls) — nothing to create from a builder. */
  external?: boolean
}

export const SECTIONS: SectionDef[] = [
  { key: 'calls',    icon: '📞', label: 'Samtal',              blurb: 'Kundens riktiga samtal med sammanfattning och transkript. Klienten sätter status och skriver anteckningar. Telefonnummer maskeras.', external: true },
  { key: 'voice',    icon: '🎙️', label: 'Röstdemo',            blurb: 'Prospekten ringer AI-receptionisten direkt i webbläsaren.' },
  { key: 'sms',      icon: '💬', label: 'SMS-recensionsflöde', blurb: 'Klickbar simulering av recensionsautomationen.' },
  { key: 'audit',    icon: '📊', label: 'Audit-höjdpunkter',   blurb: 'Synlighetspoäng och de största förbättringsmöjligheterna.' },
  { key: 'proposal', icon: '📄', label: 'Förslag',             blurb: 'Värdesumma och länk till hela förslaget.' },
  { key: 'benefits', icon: '✨', label: 'Varför Loopr',        blurb: 'Fyra fördelskort — säljargumenten.', alwaysAvailable: true },
]

export type SectionFlags = Record<SectionKey, boolean>

/** master_sections as stored -> one flag per section, with missing keys on. */
export function sectionFlags(stored: Record<string, boolean> | null | undefined): SectionFlags {
  return Object.fromEntries(SECTIONS.map(s => [s.key, stored?.[s.key] !== false])) as SectionFlags
}
