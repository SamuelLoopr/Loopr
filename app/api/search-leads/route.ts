import { NextRequest, NextResponse } from 'next/server'

export interface LeadResult {
  place_id: string
  name: string
  address: string
  phone: string
  website: string
  rating: number | null
  total_ratings: number
  ai_score: number
  ai_reason: string
  maps_url: string
}

// Fetch details for one place (phone + website)
async function fetchPlaceDetails(placeId: string, googleKey: string): Promise<{ phone: string; website: string }> {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_phone_number,website&key=${googleKey}&language=sv`
    const res = await fetch(url)
    const data = await res.json()
    return {
      phone: data.result?.formatted_phone_number ?? '',
      website: data.result?.website ?? '',
    }
  } catch {
    return { phone: '', website: '' }
  }
}

// Score leads against ICP using Claude
async function scoreLeads(leads: Omit<LeadResult, 'ai_score' | 'ai_reason'>[], icp: string, anthropicKey: string) {
  if (!anthropicKey || !icp.trim()) {
    return leads.map(l => ({ ...l, ai_score: 50, ai_reason: 'Sätt ANTHROPIC_API_KEY + ICP för AI-poängsättning' }))
  }

  const list = leads.map((l, i) => `${i + 1}. ${l.name} — ${l.address} (betyg: ${l.rating ?? 'okänt'})`).join('\n')

  const prompt = `Du är en B2B-säljexpert. Nedan är en Idealisk Kundprofil (ICP) och en lista med företag.

ICP:
${icp}

Företag att poängsätta:
${list}

Returnera ENBART giltig JSON-array med ett objekt per företag i exakt samma ordning:
[{"score": <0-100>, "reason": "<1 mening på svenska>"}]

Poäng 80+ = utmärkt match, 60-79 = bra match, 40-59 = okej, under 40 = dålig match.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) throw new Error('Claude API-fel')

    const data = await res.json()
    const raw = data.content?.[0]?.text ?? '[]'
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    const scores: { score: number; reason: string }[] = jsonMatch ? JSON.parse(jsonMatch[0]) : []

    return leads.map((l, i) => ({
      ...l,
      ai_score: scores[i]?.score ?? 50,
      ai_reason: scores[i]?.reason ?? '',
    }))
  } catch {
    return leads.map(l => ({ ...l, ai_score: 50, ai_reason: 'Poängsättning misslyckades' }))
  }
}

export async function POST(req: NextRequest) {
  const { industry, location, radius = 10, maxResults = 25, icp = '' } = await req.json()

  const googleKey = process.env.GOOGLE_PLACES_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? ''

  // ── Mock data when no Google API key ─────────────────────────────────────
  if (!googleKey) {
    const mockLeads: LeadResult[] = Array.from({ length: 6 }, (_, i) => ({
      place_id: `mock_${i}`,
      name: ['Rörmokarna i Stockholm AB', 'Elservice Lindqvist', 'Städfirman Persson', 'Bilverkstad Norr', 'Frisör Studio Maja', 'VVS Expert Göteborg'][i],
      address: [`Kungsgatan ${10 + i}, Stockholm`, 'Storgatan 5, Malmö', 'Parkvägen 3, Uppsala', 'Industrivägen 12, Göteborg', 'Torggatan 7, Lund', 'Hamngatan 2, Göteborg'][i],
      phone: `070-${100 + i * 111} ${i * 22 + 10} ${i * 5 + 50}`,
      website: `https://www.example${i}.se`,
      rating: [4.5, 4.2, 3.8, 4.7, 4.1, 3.9][i],
      total_ratings: [87, 34, 156, 12, 203, 67][i],
      ai_score: 0,
      ai_reason: '',
      maps_url: `https://maps.google.com/?q=${encodeURIComponent(['Rörmokarna i Stockholm AB', 'Elservice Lindqvist', 'Städfirman Persson', 'Bilverkstad Norr', 'Frisör Studio Maja', 'VVS Expert Göteborg'][i])}`,
    }))

    const scored = await scoreLeads(
      mockLeads.map(({ ai_score: _s, ai_reason: _r, ...rest }) => rest),
      icp,
      anthropicKey
    )
    return NextResponse.json({
      results: scored.sort((a, b) => b.ai_score - a.ai_score),
      mock: true,
      message: 'Demo-data — lägg till GOOGLE_PLACES_API_KEY i .env.local för riktiga sökresultat.',
    })
  }

  // ── Real Google Places search ─────────────────────────────────────────────
  const query = [industry, location].filter(Boolean).join(' i ')
  const radiusMeters = radius * 1000
  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&radius=${radiusMeters}&key=${googleKey}&language=sv`

  const searchRes = await fetch(searchUrl)
  if (!searchRes.ok) {
    return NextResponse.json({ error: 'Google Places API-fel' }, { status: 502 })
  }

  const searchData = await searchRes.json()
  const places = (searchData.results ?? []).slice(0, maxResults) as {
    place_id: string; name: string; formatted_address: string;
    rating?: number; user_ratings_total?: number;
  }[]

  // Fetch details (phone + website) in parallel — limit concurrency
  const detailed = await Promise.all(
    places.map(async p => {
      const details = await fetchPlaceDetails(p.place_id, googleKey)
      const partial: Omit<LeadResult, 'ai_score' | 'ai_reason'> = {
        place_id: p.place_id,
        name: p.name,
        address: p.formatted_address,
        phone: details.phone,
        website: details.website,
        rating: p.rating ?? null,
        total_ratings: p.user_ratings_total ?? 0,
        maps_url: `https://www.google.com/maps/place/?q=place_id:${p.place_id}`,
      }
      return partial
    })
  )

  const scored = await scoreLeads(detailed, icp, anthropicKey)
  return NextResponse.json({ results: scored.sort((a, b) => b.ai_score - a.ai_score) })
}
