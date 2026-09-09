import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

async function scrapeUrl(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Loopr/1.0; +https://loopr.se)' },
    })
    const html = await res.text()
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000)
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

function genShareId() {
  return Math.random().toString(36).substring(2, 10)
}

export async function POST(req: NextRequest) {
  const { businessName, websiteUrl, agentId, leadId } = await req.json()
  if (!businessName || !websiteUrl) {
    return NextResponse.json({ error: 'Företagsnamn och URL krävs' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY saknas' }, { status: 500 })

  const fullUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`
  const siteText = await scrapeUrl(fullUrl)

  const prompt = `Du är en senior digital marknadsanalytiker och säljkonsult. Analysera följande webbplatsinnehåll för företaget "${businessName}" och generera en professionell audit-rapport på svenska.

Webbplatsinnehåll (max 5000 tecken):
---
${siteText || '(Kunde inte hämta webbplatsens innehåll — basera analysen på branschsnitt för denna typ av lokalt serviceföretag)'}
---
Webbplats-URL: ${fullUrl}

Returnera ENBART giltig JSON (inga kommentarer, ingen markdown) i exakt detta schema:
{
  "summary": "2-3 meningar som sammanfattar företagets online-närvaro och det viktigaste förbättringsområdet",
  "google_rating": "betyget som sträng, t.ex. '4.2' — eller 'Okänt' om det inte finns på sidan",
  "google_reviews_count": "antal recensioner som sträng, t.ex. '142 recensioner' — eller 'Okänt'",
  "missed_calls_pct": 27,
  "visibility_score": <heltal 0-100 baserat på: +20 om tydlig kontaktinfo, +20 om öppettider, +20 om tjänstelista, +20 om tydlig CTA, +20 om professionell design/struktur>,
  "visibility_details": {
    "has_contact": <true om telefon/email finns>,
    "has_hours": <true om öppettider finns>,
    "has_services": <true om tjänstelista finns>,
    "has_cta": <true om tydlig call-to-action finns>,
    "has_reviews": <true om recensioner/omdömen nämns>
  },
  "improvements": [
    "Konkret förbättringsförslag 1 (1-2 meningar, specifik och säljorienterad)",
    "Konkret förbättringsförslag 2",
    "Konkret förbättringsförslag 3",
    "Konkret förbättringsförslag 4 (valfritt)",
    "Konkret förbättringsförslag 5 (valfritt)"
  ]
}`

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!claudeRes.ok) {
    const raw = await claudeRes.text()
    // Surface the human-readable reason instead of dumping the raw JSON body
    // into the UI. Billing problems are by far the most common cause, so they
    // get a message that says what to actually do about it.
    let message = raw
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string } }
      message = parsed.error?.message ?? raw
    } catch { /* keep the raw text */ }

    if (/credit balance/i.test(message)) {
      message = 'Anthropic-kontot har slut på krediter — fyll på under Plans & Billing för att kunna generera audits.'
    } else if (claudeRes.status === 429) {
      message = 'Anthropic-API:et är överbelastat just nu. Försök igen om en stund.'
    }

    return NextResponse.json({ error: message }, { status: claudeRes.status })
  }

  const claudeData = await claudeRes.json()
  const rawText = claudeData.content?.[0]?.text ?? '{}'

  let content: Record<string, unknown>
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    content = JSON.parse(jsonMatch ? jsonMatch[0] : rawText)
  } catch {
    content = { summary: rawText, visibility_score: 50, missed_calls_pct: 27, improvements: [] }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const shareId = genShareId()
  const base = { business_name: businessName, website_url: fullUrl, share_id: shareId, status: 'completed', content }

  // agent_id/lead_id come from migration 015. Audits created from the Lead
  // Finder or the Audit Maker have no agent, and the columns may not exist yet
  // on a database that hasn't run 015 — so link when we can and fall back to an
  // unlinked audit rather than failing the whole generation.
  let { data, error } = agentId
    ? await supabase.from('audits').insert({ ...base, agent_id: agentId, lead_id: leadId ?? null }).select().single()
    : await supabase.from('audits').insert(base).select().single()

  if (error && error.message.includes('agent_id') && error.message.includes('does not exist')) {
    ({ data, error } = await supabase.from('audits').insert(base).select().single())
  }

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Kunde inte spara audit' }, { status: 500 })
  }

  return NextResponse.json({ audit: data })
}
