import { NextRequest, NextResponse } from 'next/server'
import { describeAnthropicError } from '@/lib/upstream-errors'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const EDITABLE_FIELDS = ['prompt_text', 'welcome_message', 'description', 'services', 'pain_points', 'goals'] as const

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY saknas' }, { status: 500 })

  const { agentId, problemDescription } = await req.json()
  if (!agentId || !problemDescription?.trim()) {
    return NextResponse.json({ error: 'agentId och problemDescription krävs' }, { status: 400 })
  }

  // Acts as the signed-in user rather than as anon: middleware.ts already
  // guarantees a session on this route, and the authenticated-only RLS policies
  // in 019_auth_rls.sql would reject these reads and writes from the anon role.
  const supabase = await createSupabaseServerClient()

  const [{ data: agent, error: agentErr }, { data: calls }] = await Promise.all([
    supabase
      .from('agents')
      .select('prompt_text, welcome_message, description, services, pain_points, goals')
      .eq('id', agentId)
      .single(),
    supabase
      .from('call_logs')
      .select('transcript, summary, status, error_message, created_at')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  if (agentErr || !agent) return NextResponse.json({ error: 'Agent hittades inte' }, { status: 404 })

  const transcriptBlock = (calls ?? [])
    .filter(c => c.transcript || c.error_message)
    .map((c, i) => `--- Samtal ${i + 1} (${c.created_at}, status: ${c.status ?? 'completed'}) ---\n${c.error_message ? `Fel: ${c.error_message}\n` : ''}${c.transcript ?? '(ingen transkript)'}`)
    .join('\n\n')

  const userPrompt = `Du är expert på att felsöka AI-receptionist-agenter (röstbotar som svarar i telefon/webbläsare åt lokala serviceföretag).

BESKRIVET PROBLEM FRÅN ANVÄNDAREN:
${problemDescription}

SENASTE SAMTALSTRANSKRIPT (upp till 5):
${transcriptBlock || '(inga loggade samtal ännu)'}

NUVARANDE FÄLT PÅ AGENTEN:
- prompt_text: ${agent.prompt_text ? agent.prompt_text.slice(0, 3000) : '(tomt)'}
- welcome_message: ${agent.welcome_message ?? '(tomt)'}
- description: ${agent.description ?? '(tomt)'}
- services: ${agent.services ?? '(tomt)'}
- pain_points: ${agent.pain_points ?? '(tomt)'}
- goals: ${agent.goals ?? '(tomt)'}

Diagnostisera problemet utifrån transkripten och beskrivningen. Föreslå EN konkret ändring till EXAKT ETT av fälten ovan (prompt_text, welcome_message, description, services, pain_points, goals) som skulle lösa problemet.

Svara ENDAST med JSON i exakt detta format, ingen text före eller efter:
{
  "diagnosis": "kort förklaring av vad som är fel och varför, 2-4 meningar",
  "suggestedField": "ett av: prompt_text | welcome_message | description | services | pain_points | goals",
  "suggestedValue": "det fullständiga nya värdet för det fältet (hela fältet, inte bara diffen)"
}`

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
  const text: string = data.content?.[0]?.text ?? ''

  let parsed: { diagnosis: string; suggestedField: string; suggestedValue: string }
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text)
  } catch {
    return NextResponse.json({ error: 'Kunde inte tolka Claudes svar som JSON', raw: text }, { status: 502 })
  }

  if (!EDITABLE_FIELDS.includes(parsed.suggestedField as typeof EDITABLE_FIELDS[number])) {
    return NextResponse.json({ error: `Ogiltigt föreslaget fält: ${parsed.suggestedField}` }, { status: 502 })
  }

  const currentValue = (agent as Record<string, string | null>)[parsed.suggestedField] ?? ''

  return NextResponse.json({
    diagnosis: parsed.diagnosis,
    suggestedField: parsed.suggestedField,
    currentValue,
    suggestedValue: parsed.suggestedValue,
  })
}
