import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { alertOngoingLongCalls } from '@/lib/long-calls'
import { logCronRun } from '@/lib/cron-runs'

// Var tionde minut (vercel.json, kräver Vercel Pro): varnar om en linje varit
// uppkopplad hos 46elks i mer än 15 minuter (lib/long-calls.ts), högst en
// varning i timmen. Samma kontroll körs också vid varje inkommande samtal och
// post-call; den här fångar linjer som fastnar när inga nya samtal kommer.
//
// Varje körning loggas i cron_runs (053), även när allt är bra.
//
// Samma skydd som de andra cron-routerna.

export const dynamic = 'force-dynamic'
export const maxDuration = 20

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
    console.warn('[cron/long-calls] Avvisad: hemligheten stämmer inte eller CRON_SECRET saknas')
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const ranAt = new Date()
  const supabase = createSupabaseServiceClient()
  const { stuck, alert } = await alertOngoingLongCalls(supabase)
  // stuck null = 46elks gick inte att läsa: loggas som ett problem.
  const ok = stuck === 0
  await logCronRun(supabase, { job: 'long_calls', ranAt, ok, problems: stuck ?? 1, alert, durationMs: Date.now() - ranAt.getTime() })
  return NextResponse.json({ ok, stuck })
}
