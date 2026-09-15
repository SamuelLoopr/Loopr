import { NextRequest, NextResponse } from 'next/server'
import { describeAnthropicError } from '@/lib/upstream-errors'

export async function POST(req: NextRequest) {
  const { industry, location } = await req.json()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY saknas i .env.local' }, { status: 500 })
  }

  const prompt = `Du är en B2B-säljexpert för ett AI-receptionist- och recensionsautomationsföretag i Sverige.

Skapa en detaljerad Idealisk Kundprofil (ICP) på svenska för:
- Bransch: ${industry || 'okänd'}
- Plats: ${location || 'Sverige'}

Formatet ska vara tydligt och strukturerat med dessa rubriker:
1. Företagstyp & storlek
2. Typiska smärtpunkter
3. Varför de behöver AI-receptionist
4. Beslutsfattare (titel/roll)
5. Budgetsignaler att leta efter
6. Röda flaggor (diskvalificerande faktorer)

Håll det konkret och handlingsbart. Max 300 ord.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: describeAnthropicError(res.status, err) }, { status: res.status })
  }

  const data = await res.json()
  const text = data.content?.[0]?.text ?? ''
  return NextResponse.json({ icp: text })
}
