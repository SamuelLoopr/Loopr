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

/**
 * Samma sak för en väg där agenten inte kan lägga på.
 *
 * På SIP-vägen (46elks -> ElevenLabs) tappas ElevenLabs SIP BYE, så end_call
 * avslutar konversationen medan telefonlinjen ligger kvar. Uppmätt på tre
 * samtal 2026-10-03, 46elks-benet mot konversationen:
 *
 *   56 s mot 37 s      19 s död linje
 *   38 s mot 28 s      10 s död linje
 *   13 s mot 13 s      0 s — men där la kunden på själv
 *
 * Följden blir att agenten säger "jag avslutar samtalet nu" och sedan inte
 * gör det: kunden sitter kvar i tystnad och pratar i tomma intet. Att inte
 * lova något den inte kan hålla är bättre än att hålla instruktionen kvar.
 *
 * Utan end_call lever konversationen vidare, agenten fortsätter lyssna, och
 * när kunden lägger på rivs allt ner korrekt — den riktningen fungerar
 * bevisligen. Därför uppmanas den att ta ett tydligt farväl som får kunden
 * att lägga på, i stället för att själv försöka.
 */
const END_CALL_SV_NO_HANGUP = `AVSLUTA SAMTALET:
När den som ringer tackar för sig, säger hejdå, eller på annat sätt visar att ärendet är klart — ta ett tydligt och vänligt farväl och sluta sedan tala.
Du kan inte lägga på det här samtalet själv. Säg därför aldrig att du avslutar eller lägger på, och lova inte att göra det — det är den som ringt som avslutar. Ett avslut som "Tack för ditt samtal, ha en fin dag!" räcker och låter personen lägga på själv.
Behöver du ställa en sista fråga eller bekräfta något, gör det före farvälet.
Blir det tyst en stund efter farvälet: fråga en gång om det är något mer, och vänta sedan utan att fylla tystnaden med prat.`

const LANGUAGE_EN =
  'IMPORTANT: Always reply in English, whatever language the caller uses.'

const END_CALL_EN = `ENDING THE CALL:
When the caller thanks you, says goodbye, or otherwise signals the matter is settled — say a warm goodbye and then end the call with the end_call tool. Do not stay on the line waiting.
Never hang up early: a "thanks" or "okay" in the middle of an ongoing matter does not mean the call is over. End it only once the matter is handled or the person clearly wants to hang up.
If you need a final question or confirmation, ask it before saying goodbye.`

const END_CALL_EN_NO_HANGUP = `ENDING THE CALL:
When the caller thanks you, says goodbye, or otherwise signals the matter is settled — give a clear, warm farewell and then stop speaking.
You cannot hang up this call yourself. So never say that you are ending or hanging up the call, and do not promise to — the caller is the one who ends it. A close like "Thanks for calling, have a good day!" is enough and lets them hang up.
If you need a final question or confirmation, ask it before saying goodbye.
If it goes quiet after your farewell: ask once whether there is anything else, then wait without filling the silence.`

export type PromptLanguage = 'sv' | 'en'

export interface PromptOptions {
  /**
   * Kan agenten faktiskt lägga på samtalet?
   *
   * true (standard) för Twilio-vägen och testsamtal, där end_call bevisligen
   * river ner samtalet — verifierat på ett skarpt inkommande samtal
   * 2026-10-02 (termination_reason "end_call tool was called.").
   *
   * false för SIP-vägen via 46elks, där verktyget rapporterar success men
   * linjen ligger kvar. Se END_CALL_SV_NO_HANGUP.
   */
  canEndCall?: boolean
}

/**
 * Kundens egen prompt med de gemensamma reglerna före.
 *
 * Reglerna ligger först så att de gäller även när kundens egen text är lång —
 * och eftersom de är korta kostar de nästan inget i varje samtal.
 */
export function buildSystemPrompt(
  basePrompt: string,
  language: PromptLanguage,
  { canEndCall = true }: PromptOptions = {},
): string {
  // Standardvärdet true gör att alla befintliga anropsställen beter sig exakt
  // som förut — bara den som uttryckligen säger annat får den andra texten.
  const endCall = language === 'sv'
    ? (canEndCall ? END_CALL_SV : END_CALL_SV_NO_HANGUP)
    : (canEndCall ? END_CALL_EN : END_CALL_EN_NO_HANGUP)
  const language_ = language === 'sv' ? LANGUAGE_SV : LANGUAGE_EN
  return `${language_}\n\n${endCall}\n\n${basePrompt}`
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
