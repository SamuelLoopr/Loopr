import { NextRequest, NextResponse, after } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { ELKS_FAILURE_TEXT, verifyElksCallback } from '@/lib/elks-callback'
import { notifySmsReply, parseIncomingSms, saveIncomingSms } from '@/lib/sms-reply'

// 46elks sms_url: ett sms har kommit in till ett av våra nummer — i praktiken
// ett svar på sms-bekräftelsen efter ett samtal (lib/call-sms.ts).
//
// Samma skydd som incoming-call: ogissbar token i vägen och 46elks
// dokumenterade IP-adresser (lib/elks-callback.ts — läs varningen där).
//
// SVARA ALDRIG MED TEXT. 46elks skickar en icke-tom svarskropp vidare som ett
// sms till avsändaren. Därför 204 utan kropp i alla fall som ska kvitteras.
// Bara när databasen inte går att nå svarar vi 500, så att 46elks försöker
// igen (minst fem gånger under sex timmar) i stället för att svaret tappas.

export const dynamic = 'force-dynamic'

const NO_REPLY = () => new NextResponse(null, { status: 204 })

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const auth = verifyElksCallback(req, token)
  if (!auth.ok) {
    console.warn(`[46elks/incoming-sms] Avvisad (${auth.ip ?? 'okänd IP'}): ${ELKS_FAILURE_TEXT[auth.reason]}`)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const raw = await req.text()
  let fields: Record<string, string> = {}
  try {
    fields = raw.trimStart().startsWith('{')
      ? Object.fromEntries(Object.entries(JSON.parse(raw) as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
      : Object.fromEntries(new URLSearchParams(raw))
  } catch {
    console.error('[46elks/incoming-sms] Kunde inte tolka bodyn')
    return NO_REPLY()
  }

  const sms = parseIncomingSms(fields)
  if (!sms) {
    console.error('[46elks/incoming-sms] Saknar id, from eller to — kvitteras utan att sparas')
    return NO_REPLY()
  }

  const supabase = createSupabaseServiceClient()
  const result = await saveIncomingSms(supabase, sms)

  switch (result.outcome) {
    case 'saved':
      // Mejlet efter svaret: 46elks ska inte vänta på vår e-postleverantör.
      after(
        notifySmsReply(supabase, result.agentId, result.replyId)
          .catch(err => console.error('[46elks/incoming-sms] Mejlet kastade:', err)),
      )
      console.log(`[46elks/incoming-sms] Svar sparat (${sms.id})`)
      return NO_REPLY()
    case 'db_error':
      // Tom kropp även här, för säkerhets skull: ingen text som kan bli ett sms.
      return new NextResponse(null, { status: 500 })
    default:
      console.warn(`[46elks/incoming-sms] Ej sparat (${sms.id}): ${result.outcome}`)
      return NO_REPLY()
  }
}
