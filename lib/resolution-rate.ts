// Lösningsgrad: andelen samtal AI-receptionisten klarar helt själv.
//
// Räknas på ett ställe eftersom siffran visas på två — dashboardens "Aktiva
// klienter" och klientens egen "Ert konto" i BOS. Visar de olika tal för samma
// period är siffran värdelös som argument.
//
// Bedömningen per samtal görs av Claude-analysen och ligger i
// call_logs.ai_resolved (032). Här görs bara summeringen.

export interface ResolutionRow {
  /** call_logs.ai_resolved. undefined när migrationen inte är körd. */
  ai_resolved?: boolean | null
}

export interface Resolution {
  /** Samtal AI:n klarade helt själv. */
  solved: number
  /** Samtal som kräver uppföljning, eller där receptionisten inte kunde svara. */
  unsolved: number
  /**
   * Samtal utan bedömning: ingen sa något, eller samtalet är inte analyserat
   * än. Ligger utanför både täljare och nämnare — se 032_call_resolution.sql.
   */
  unrated: number
  /** solved / (solved + unsolved), 0–1. Null när inget samtal är bedömt. */
  rate: number | null
}

export function resolutionOf(rows: readonly ResolutionRow[]): Resolution {
  let solved = 0
  let unsolved = 0
  let unrated = 0

  for (const row of rows) {
    if (row.ai_resolved === true) solved++
    else if (row.ai_resolved === false) unsolved++
    else unrated++
  }

  const rated = solved + unsolved
  return { solved, unsolved, unrated, rate: rated > 0 ? solved / rated : null }
}

/**
 * "91 %" — eller null när det inte finns något att visa.
 *
 * Avrundas nedåt till heltal: att visa 100 % när ett av fyrtio samtal gick
 * till uppföljning vore fel, och det är just den sortens siffra som gör att
 * ingen tror på resten.
 */
export function formatRate(rate: number | null): string | null {
  if (rate == null) return null
  return `${Math.floor(rate * 100)} %`
}

/** Hur många bedömda samtal som behövs innan siffran är värd att visa. */
export const MIN_RATED = 3
