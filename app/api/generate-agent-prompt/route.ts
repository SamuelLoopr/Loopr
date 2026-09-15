import { NextRequest, NextResponse } from 'next/server'
import { describeAnthropicError } from '@/lib/upstream-errors'

async function scrapeUrl(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Loopr/1.0; +https://loopr.se)' },
    })
    const html = await res.text()
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000)
    return text
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

export async function POST(req: NextRequest) {
  const { url, businessName, language = 'sv' } = await req.json()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY saknas' }, { status: 500 })

  const langLabel = language === 'sv' ? 'svenska' : 'English'

  let siteContent = ''
  if (url) {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`
    siteContent = await scrapeUrl(fullUrl)
  }

  const userPrompt = `Du är expert på att bygga AI-receptionist-systempromptar för svenska lokala serviceföretag.

Skapa en fullständig receptionist-prompt på ${langLabel} för företaget "${businessName || 'företaget'}".
${siteContent ? `\nWebbplatsinnehåll (använd detta som kunskapskälla):\n---\n${siteContent}\n---\n` : ''}

Returnera ENBART prompten i exakt detta format (ingen inledning, ingen förklaring):

### INTRODUKTION
Du är ${businessName || '[Företagsnamn]'}s AI-receptionist. Du talar ${langLabel} och representerar företaget professionellt och hjälpsamt.

### KUNSKAPSBAS OM FÖRETAGET
[Strukturerad info om tjänster, öppettider, kontaktuppgifter, priser och FAQ baserat på webbplatsens innehåll. Om ingen info finns, skriv typiska uppgifter för den branschen.]

### HUVUDMÅL
[2-4 punkter om vad du ska uppnå med varje samtal: boka möten, besvara frågor, kvalificera leads]

### DATUM & TIDER
[Hur du hanterar bokningsförfrågningar. Be alltid om önskad dag och tid. Bekräfta att det stämmer.]

### OMFATTNING
[Vad du kan hjälpa med och vad du inte kan (priser kräver besök/offert etc.)]

### TON & STIL
[Professionell men varm, tydlig, undviker fackterminer för kunder etc.]

### MINSTA INFORMATION FÖR BOKNING
Samla alltid in: fullständigt namn, telefonnummer, adress/plats, typ av tjänst, önskad tid.

### BOKNINGSFLÖDE
1. Hälsa och presentera dig
2. Fråga om ärendet
3. Samla nödvändig information
4. Bekräfta tillgänglighet
5. Sammanfatta och bekräfta bokningen
6. Avsluta vänligt

### SÄRSKILDA SITUATIONER
[Hur du hanterar klagomål, akuta ärenden, och situationer du inte kan lösa]

### VIDAREKOPPLING
[Koppla vidare när kunden är arg, ärendet är tekniskt komplext, eller de ber om det]

### AVSLUTANDE PÅMINNELSER
[3-5 viktiga saker att alltid komma ihåg i varje samtal]`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: describeAnthropicError(res.status, err) }, { status: res.status })
  }

  const data = await res.json()
  const text = data.content?.[0]?.text ?? ''
  return NextResponse.json({ prompt: text })
}
