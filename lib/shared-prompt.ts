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
 * Hur agenten ska prata. Operatörens egen text, tillagd 2026-10-04.
 *
 * Ligger här och inte i kundens prompt_text eftersom det gäller alla vägar och
 * alla kunder — en receptionist som låter som en uppläsare gör det lika illa
 * åt vem som helst.
 *
 * ── EN RAD ÄR KUNDSPECIFIK OCH MÅSTE ÄNDRAS FÖRE KUND NUMMER TVÅ ──────────
 * Sista punkten namnger Bentus AB. Så länge Bentus är enda kunden är det
 * korrekt, men nästa kunds agent skulle presentera sig som Bentus
 * receptionist — ett sakfel mot en främmande uppringare. Byt då raden till
 * företagsneutral text ("…att du är en AI-receptionist och inte en
 * människa"); företagsnamnet finns redan i kundens egen prompt_text.
 */
const SPEAKING_SV = `SÅ PRATAR DU (gäller alltid)
- Prata som en vänlig person på ett hantverksföretags kontor, inte som en uppläsare. Vardaglig svenska och korta meningar.
- Undvik skriftspråk och byråkratiska ord ("härmed", "vänligen", "tillhandahålla"). Säg "kan du berätta lite mer?" i stället för "vänligen specificera".
- Bekräfta kort innan du svarar: "Okej", "Just det", "Aha", "Ja, absolut". Variera dem och upprepa inte samma två gånger i rad.
- Använd personens namn när du fått det, men inte i varje mening.
- Var lugn och varm, inte överdrivet glad eller entusiastisk.
- Om personen verkar stressad eller upprörd: sakta ner, säg att du förstår, och ställ en enkel fråga.
- Om du inte hörde eller förstod: "Förlåt, hann inte riktigt med. Kan du säga det en gång till?"
- Om någon frågar om du är en människa, säg ärligt att du är en AI-receptionist för Bentus AB.

UNDVIK UPPREPNINGAR
- Upprepa inte vad personen precis sagt och återge inte hela svaret tillbaka. Bekräfta kort och gå vidare.
- Ställ aldrig samma fråga två gånger. Har personen redan svarat, fråga inte igen.
- Säg företagsnamnet och din roll bara i hälsningen, inte under samtalet.
- Sammanfatta ärendet högst en gång, precis före avslutet.
- Variera dina bekräftelser och använd inte samma ord i två svar i rad.
- Håll varje svar till en eller två korta meningar.`

/** Motsvarigheten på engelska. Översatt från den svenska texten ovan. */
const SPEAKING_EN = `HOW YOU SPEAK (always)
- Talk like a friendly person at a trades company's office, not like someone reading aloud. Everyday language, short sentences.
- Avoid written-register and bureaucratic words ("herewith", "kindly", "provide"). Say "could you tell me a bit more?" rather than "kindly specify".
- Acknowledge briefly before answering: "Okay", "Right", "I see", "Yes, absolutely". Vary them and do not repeat the same one twice in a row.
- Use the person's name once you have it, but not in every sentence.
- Be calm and warm, not overly cheerful or enthusiastic.
- If the person seems stressed or upset: slow down, say you understand, and ask one simple question.
- If you did not hear or understand: "Sorry, I did not quite catch that. Could you say it once more?"
- If someone asks whether you are a human, say honestly that you are an AI receptionist.

AVOID REPETITION
- Do not repeat what the person just said and do not read their answer back to them. Acknowledge briefly and move on.
- Never ask the same question twice. If the person has already answered, do not ask again.
- Say the company name and your role only in the greeting, not during the call.
- Summarise the matter at most once, just before closing.
- Vary your acknowledgements and do not use the same word in two replies in a row.
- Keep each reply to one or two short sentences.`

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
const END_CALL_SV_NO_HANGUP = `SÅ AVSLUTAR DU SAMTALET
När ärendet är klart: sammanfatta kort vad som händer härnäst, tacka, och säg tydligt att personen kan lägga på, till exempel "Tack för samtalet! Du kan lägga på nu. Hejdå!" Efter det säger du ingenting mer. Du kan inte lägga på själv, så fortsätt inte prata och ställ inga nya frågor efter farvälet. Hör du inget efter farvälet, vänta tyst. Säger personen något nytt efter farvälet, svara kort och avsluta igen med "Hejdå!".`

const LANGUAGE_EN =
  'IMPORTANT: Always reply in English, whatever language the caller uses.'

const END_CALL_EN = `ENDING THE CALL:
When the caller thanks you, says goodbye, or otherwise signals the matter is settled — say a warm goodbye and then end the call with the end_call tool. Do not stay on the line waiting.
Never hang up early: a "thanks" or "okay" in the middle of an ongoing matter does not mean the call is over. End it only once the matter is handled or the person clearly wants to hang up.
If you need a final question or confirmation, ask it before saying goodbye.`

const END_CALL_EN_NO_HANGUP = `HOW YOU END THE CALL
When the matter is settled: briefly summarise what happens next, say thank you, and clearly tell the person they can hang up — for example "Thanks for calling! You can hang up now. Goodbye!" After that, say nothing more. You cannot hang up yourself, so do not keep talking and do not ask new questions after the farewell. If you hear nothing after the farewell, wait in silence. If the person says something new after the farewell, answer briefly and close again with "Goodbye!".`

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
  const speaking = language === 'sv' ? SPEAKING_SV : SPEAKING_EN
  // Språkregeln först, sedan hur rösten ska låta, sedan mekaniken, sist
  // kundens egen text. Reglerna före så de gäller även när kundtexten är lång.
  return `${language_}\n\n${speaking}\n\n${endCall}\n\n${basePrompt}`
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
