import { NextRequest, NextResponse, after } from 'next/server'
import crypto from 'node:crypto'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { hangUpConversation } from '@/lib/elks-hangup'

// Verktyget lagg_pa hos ElevenLabs: agenten har tagit farväl och talat klart
// (execution_mode post_tool_speech), och vill att samtalet läggs på. Själva
// påläggningen sker hos 46elks (lib/elks-hangup.ts).
//
// Samma skydd som conversation-init: ELEVENLABS_INIT_TOKEN i vägen och
// ELEVENLABS_INIT_SECRET i headern x-loopr-init-secret. Svaret till
// ElevenLabs går direkt; påläggningen körs efteråt.

export const dynamic = 'force-dynamic'

const SECRET_HEADER = 'x-loopr-init-secret'

function equals(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const expectedToken = process.env.ELEVENLABS_INIT_TOKEN?.trim()
  const expectedSecret = process.env.ELEVENLABS_INIT_SECRET?.trim()
  const got = req.headers.get(SECRET_HEADER)?.trim()
  if (!expectedToken || !token || !equals(expectedToken, token) || !expectedSecret || !got || !equals(expectedSecret, got)) {
    console.warn('[elevenlabs/hangup] Avvisad: token eller hemlig header stämmer inte')
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false })
  }

  const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id.trim() : ''
  const calledNumber = typeof body.called_number === 'string' ? body.called_number.trim() : ''
  const callerId = typeof body.caller_id === 'string' ? body.caller_id.trim() || null : null

  after(
    hangUpConversation(createSupabaseServiceClient(), { conversationId, calledNumber, callerId })
      .then(outcome => console.log(`[elevenlabs/hangup] ${conversationId || '?'}: ${outcome}`))
      .catch(err => console.error('[elevenlabs/hangup] Kastade:', err)),
  )

  // Agenten ska inte säga något mer; svaret är bara en kvittens.
  return NextResponse.json({ ok: true })
}
