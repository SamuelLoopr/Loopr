import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { checkHealth } from '@/lib/health-check'
import { sendOpsAlert } from '@/lib/ops-alert'

// Morgonkontrollen: varje morgon (vercel.json, 06:00 UTC = 07:00 svensk
// vintertid, 08:00 sommartid). Hittar lib/health-check.ts något får
// operatören ett mejl och ett sms (lib/ops-alert.ts). Är allt bra skickas
// ingenting.
//
// Samma skydd som /api/cron/retention: Vercel Cron skickar
// `Authorization: Bearer ${CRON_SECRET}`, och x-loopr-cron-secret går att
// använda för att köra den för hand. Routen ändrar ingenting.

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SECRET_HEADER = 'x-loopr-cron-secret'

function equals(a: string, b: string): boolean {
  const bufA = Buffer.from(a), bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const bearer = req.headers.get('authorization')?.trim()
  if (bearer?.startsWith('Bearer ') && equals(secret, bearer.slice(7))) return true
  const own = req.headers.get(SECRET_HEADER)?.trim()
  return Boolean(own && equals(secret, own))
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    console.warn('[cron/health] Avvisad: hemligheten stämmer inte eller CRON_SECRET saknas')
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = createSupabaseServiceClient()
  const problems = await checkHealth(supabase)
  if (problems.length === 0) {
    console.log('[cron/health] Allt ser bra ut')
    return NextResponse.json({ ok: true, problems: 0 })
  }

  const message = [`Morgonkontroll: ${problems.length} problem`, ...problems.map(p => `- ${p}`)].join('\n')
  const alert = await sendOpsAlert(supabase, 'morning', message, {
    throttle: false,
    smsText: `Loopr: morgonkontrollen hittade ${problems.length} problem. Se mejl.`,
  })
  console.log(`[cron/health] ${problems.length} problem, varning: ${alert}`)
  return NextResponse.json({ ok: false, problems: problems.length, alert })
}
