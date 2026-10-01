// Vad ett samtal kostar oss, och hur det blir kronor.
//
// Alla leverantörer fakturerar i USD, så kostnader lagras i USD och växlas vid
// visning. Kursen är en miljövariabel, inte ett live-API: en uppskattning som
// går att justera räcker gott för en marginalöversikt, och den gör att samma
// siffra inte ändrar sig mellan två sidladdningar.
//
// Fri från imports så den kan enhetstestas med vanliga `node`.

/** Kurs USD -> SEK. Sätt USD_TO_SEK_RATE i servermiljön för att ändra. */
export const DEFAULT_USD_TO_SEK = 9.5

export function usdToSekRate(): number {
  const raw = Number(process.env.USD_TO_SEK_RATE)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_USD_TO_SEK
}

export const toSek = (usd: number, rate = usdToSekRate()): number => usd * rate

// ── Anthropic ───────────────────────────────────────────────────────────────
// Priset för modellen i lib/call-insights.ts. Ändras modellen där måste den
// här tabellen följa med — annars räknas kostnaden på fel pris.
export const ANTHROPIC_MODEL = 'claude-opus-5-5'
export const ANTHROPIC_PRICE_PER_MTOK = { input: 4, output: 20 }

/**
 * Uppmätt snitt per samtalsanalys: 997 in / 266 ut tokens över tre riktiga
 * Bentus-samtal (2026-10-01). Används för samtal som analyserades innan
 * tokenloggningen fanns — de går inte att slå upp i efterhand hos Anthropic.
 * Gränssnittet märker sådana rader som uppskattade.
 */
export const ANTHROPIC_FALLBACK_USD =
  (997 / 1e6) * ANTHROPIC_PRICE_PER_MTOK.input + (266 / 1e6) * ANTHROPIC_PRICE_PER_MTOK.output

export function anthropicCostUsd(inputTokens: number | null, outputTokens: number | null): {
  usd: number
  /** Sant när siffran är schablonen, inte uppmätt förbrukning. */
  estimated: boolean
} {
  if (inputTokens == null || outputTokens == null) {
    return { usd: ANTHROPIC_FALLBACK_USD, estimated: true }
  }
  return {
    usd:
      (inputTokens / 1e6) * ANTHROPIC_PRICE_PER_MTOK.input +
      (outputTokens / 1e6) * ANTHROPIC_PRICE_PER_MTOK.output,
    estimated: false,
  }
}

// ── Twilio ──────────────────────────────────────────────────────────────────
/**
 * Twilio skickar price som en sträng där avgifter är negativa ("-0.02140").
 * Vi lagrar den som ett positivt belopp, eftersom allt annat på sidan är
 * kostnader. Null när Twilio inte satt något pris än (det dröjer några minuter)
 * eller när samtalet aldrig debiterades (busy, no-answer).
 */
export function parseTwilioPrice(price: string | number | null | undefined): number | null {
  if (price === null || price === undefined || price === '') return null
  const n = Math.abs(Number(price))
  return Number.isFinite(n) ? n : null
}

// ── Sammanräkning ───────────────────────────────────────────────────────────
export interface CallCostRow {
  cost_twilio_usd: number | null
  cost_elevenlabs_usd: number | null
  anthropic_input_tokens: number | null
  anthropic_output_tokens: number | null
}

export interface CostTotals {
  twilioUsd: number
  elevenLabsUsd: number
  anthropicUsd: number
  totalUsd: number
  /** Antal samtal där någon kostnad är uppskattad eller saknas helt. */
  estimatedCalls: number
  missingTwilio: number
  missingElevenLabs: number
}

export function sumCosts(rows: CallCostRow[]): CostTotals {
  const t: CostTotals = {
    twilioUsd: 0, elevenLabsUsd: 0, anthropicUsd: 0, totalUsd: 0,
    estimatedCalls: 0, missingTwilio: 0, missingElevenLabs: 0,
  }

  for (const row of rows) {
    if (row.cost_twilio_usd == null) t.missingTwilio++
    else t.twilioUsd += Number(row.cost_twilio_usd)

    if (row.cost_elevenlabs_usd == null) t.missingElevenLabs++
    else t.elevenLabsUsd += Number(row.cost_elevenlabs_usd)

    const anthropic = anthropicCostUsd(row.anthropic_input_tokens, row.anthropic_output_tokens)
    t.anthropicUsd += anthropic.usd
    if (anthropic.estimated) t.estimatedCalls++
  }

  t.totalUsd = t.twilioUsd + t.elevenLabsUsd + t.anthropicUsd
  return t
}
