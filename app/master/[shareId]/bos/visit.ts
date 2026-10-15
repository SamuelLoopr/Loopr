// "Nya sedan ditt senaste besök" — vad den här webbläsaren såg förra gången.
//
// Sparas bara i webbläsaren (localStorage), per länk: inget skickas till servern
// och ingenting om besöken sparas där. Under samma flik ligger jämförelsepunkten
// kvar i sessionStorage, så att en omladdning inte nollställer "nya". När fliken
// döljs flyttas senaste besöket fram till nu.
//
// Lagringen kan saknas eller kasta (privat läge, blockerade webbplatsdata); då
// räknas besöket som det första, och sidan fungerar ändå.

const lastKey = (shareId: string) => `loopr.bos.senasteBesok.${shareId}`
const sessionKey = (shareId: string) => `loopr.bos.jamforMed.${shareId}`

export interface VisitBaseline {
  /** När förra besöket var, eller null första gången i den här webbläsaren. */
  previous: string | null
}

export function readBaseline(shareId: string): VisitBaseline {
  try {
    const held = sessionStorage.getItem(sessionKey(shareId))
    if (held !== null) return { previous: held || null }

    const previous = localStorage.getItem(lastKey(shareId))
    sessionStorage.setItem(sessionKey(shareId), previous ?? '')
    localStorage.setItem(lastKey(shareId), new Date().toISOString())
    return { previous }
  } catch {
    return { previous: null }
  }
}

export function markVisited(shareId: string): void {
  try {
    localStorage.setItem(lastKey(shareId), new Date().toISOString())
  } catch {
    // Inget att göra: nästa besök räknas då från det förra.
  }
}

// Sidan minns att länken är en klientsida, så att laddningsläget nästa gång
// redan ser ut som BOS i stället för säljdemon.
const modeKey = (shareId: string) => `loopr.bos.klientlage.${shareId}`

export function rememberClientMode(shareId: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(modeKey(shareId), '1')
    else localStorage.removeItem(modeKey(shareId))
  } catch {
    // Bara en snabbare laddningsbild som går förlorad.
  }
}

export function looksLikeClientMode(shareId: string): boolean {
  try {
    return localStorage.getItem(modeKey(shareId)) === '1'
  } catch {
    return false
  }
}
