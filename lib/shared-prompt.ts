// Den gemensamma delen av systemprompten — reglerna som gäller VARJE kunds
// AI-receptionist, oavsett vad deras egen prompt_text säger.
//
// Lades i en egen modul av två skäl. Dels låg språkregeln tidigare kopierad i
// tre route-filer, dels — och värre — fick den riktiga telefonvägen
// (/api/twilio/incoming-call) ingen av dem: den skickade prompt_text rakt av.
// Reglerna gällde alltså bara testsamtal i webbläsaren, inte skarpa kundsamtal.
//
// Allt som ska gälla alla kunder hör hemma här, och varje väg som startar ett
// samtal ska bygga sin prompt med buildSystemPrompt().

/**
 * Svenska hela vägen. Språkinställningen (overrides.agent.language) styr ASR och
 * TTS, men inte säkert vilken modell i ElevenLabs fallback-kedja som svarar —
 * en uttrycklig instruktion i prompten är det som faktiskt håller.
 */
const LANGUAGE_SV =
  'VIKTIGT: Du ska ALLTID svara på svenska, oavsett vilket språk kunden använder. Använd aldrig engelska.'

/**
 * Att faktiskt lägga på.
 *
 * end_call är ett inbyggt systemverktyg hos ElevenLabs och är aktiverat på vår
 * delade agent. Modellen får anropa det på eget bevåg, men deras dokumentation
 * rekommenderar att man säger ifrån NÄR det ska ske — utan det säger agenten
 * hejdå och blir kvar på linjen tills den som ringde själv lägger på.
 *
 * Andra stycket finns för att "tack" är ett vanligt kvitteringsord mitt i ett
 * samtal på svenska. Utan det riskerar agenten att lägga på mitt i ärendet.
 */
const END_CALL_SV = `AVSLUTA SAMTALET:
När den som ringer tackar för sig, säger hejdå, eller på annat sätt visar att ärendet är klart — ta vänligt farväl och avsluta sedan samtalet med verktyget end_call. Sitt inte kvar och vänta på linjen.
Lägg på i förtid gör du aldrig: ett "tack" eller "okej" mitt i ett pågående ärende betyder inte att samtalet är slut. Avsluta först när ärendet är avklarat eller när personen tydligt vill lägga på.
Behöver du ställa en sista fråga eller bekräfta något, gör det före farvälet.`

const LANGUAGE_EN =
  'IMPORTANT: Always reply in English, whatever language the caller uses.'

const END_CALL_EN = `ENDING THE CALL:
When the caller thanks you, says goodbye, or otherwise signals the matter is settled — say a warm goodbye and then end the call with the end_call tool. Do not stay on the line waiting.
Never hang up early: a "thanks" or "okay" in the middle of an ongoing matter does not mean the call is over. End it only once the matter is handled or the person clearly wants to hang up.
If you need a final question or confirmation, ask it before saying goodbye.`

export type PromptLanguage = 'sv' | 'en'

/**
 * Kundens egen prompt med de gemensamma reglerna före.
 *
 * Reglerna ligger först så att de gäller även när kundens egen text är lång —
 * och eftersom de är korta kostar de nästan inget i varje samtal.
 */
export function buildSystemPrompt(basePrompt: string, language: PromptLanguage): string {
  const shared = language === 'sv'
    ? `${LANGUAGE_SV}\n\n${END_CALL_SV}`
    : `${LANGUAGE_EN}\n\n${END_CALL_EN}`
  return `${shared}\n\n${basePrompt}`
}

/** Standardprompt när kundens agent saknar egen text. */
export const DEFAULT_PROMPT = {
  sv: 'Du är en AI-receptionist för ett svenskt lokalt serviceföretag. Svara alltid vänligt och professionellt.',
  en: 'You are an AI receptionist for a local service business. Always respond politely and professionally.',
} as const

/** Standardhälsning när kundens agent saknar egen. */
export const DEFAULT_WELCOME = {
  sv: 'Hej! Hur kan jag hjälpa dig?',
  en: 'Hello! How can I help you today?',
} as const
