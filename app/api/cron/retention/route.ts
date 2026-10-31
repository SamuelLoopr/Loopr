import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createSupabaseServiceClient } from '@/lib/supabase-server'
import { runRetention } from '@/lib/retention'

// Schemalagd gallring av personuppgifter enligt lagringstiden per kund.
//
// ── TORRKÖRNING SOM STANDARD ────────────────────────────────────────────────
// Routen raderar INGENTING om inte BÅDA dessa stämmer:
//   1. RETENTION_LIVE=true i servermiljön
//   2. kundens retention_settings.enabled = true
//
// Saknas någon av dem räknas bara vad som SKULLE raderas, och resultatet
// loggas i retention_runs med dry_run = true. Det är med avsikt två spärrar på
// olika nivåer: en global strömbrytare som operatören äger, och ett val per
// kund. En gallringsrutin som börjar radera av sig själv vid driftsättning är
// en dataförlustincident som väntar på att hända.
//
// ── SÄKERHET ────────────────────────────────────────────────────────────────
// Vercel Cron skickar `Authorization: Bearer ${CRON_SECRET}` när CRON_SECRET
// finns i miljön. Vi godtar det, och som alternativ en egen hemlig header så
// körningen går att utlösa för hand. Jämförelsen är konstant tid.
//
// Det här är en statisk hemlighet, inte en signatur över innehållet — alltså
// svagare än Twilios och ElevenLabs HMAC, men det är allt Vercel Cron
// erbjuder. Routen tar inga parametrar från anroparen som påverkar VAD som
// raderas, så en läckt hemlighet kan i värsta fall utlösa en körning som ändå
// hade skett enligt schemat.

export const dynamic = 'force-dynamic'
/** Gallringen går igenom alla kunder; standard-10 s räcker inte alltid. */
export const maxDuration = 60

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
    console.warn('[cron/retention] Avvisad: hemligheten stämmer inte eller CRON_SECRET saknas')
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Skarp körning kräver den globala strömbrytaren. Allt annat är torrkörning.
  const live = process.env.RETENTION_LIVE?.trim() === 'true'
  const dryRun = !live

  const supabase = createSupabaseServiceClient()
  const started = new Date().toISOString()

  let result
  try {
    result = await runRetention(supabase, {
      dryRun,
      // Nyckeln skickas bara med vid skarp körning. I torrkörning ska inget
      // anrop alls gå till ElevenLabs.
      elevenLabsKey: dryRun ? undefined : process.env.ELEVENLABS_API_KEY,
    })
  } catch (err) {
    console.error('[cron/retention] Körningen kastade:', err)
    return NextResponse.json({ error: 'Körningen misslyckades' }, { status: 500 })
  }

  if (result.unsupported) {
    console.warn('[cron/retention] migration 036 är inte körd — ingenting gjordes')
    return NextResponse.json({ ok: true, skipped: 'migration 036 saknas' })
  }

  // En loggrad per ägare. Körningsloggen är append-only (036).
  for (const userId of result.userIds) {
    // Bara den här ägarens kunder, och bara deras siffror. En logg som visar
    // andra operatörers volymer vore ett läckage i sig.
    const own = result.agents.filter(a => a.userId === userId)
    const sum = (pick: (a: typeof own[number]) => number) => own.reduce((n, a) => n + pick(a), 0)
    const { error } = await supabase.from('retention_runs').insert({
      user_id: userId,
      started_at: started,
      finished_at: new Date().toISOString(),
      dry_run: dryRun,
      triggered_by: req.headers.get(SECRET_HEADER) ? 'manual' : 'cron',
      scanned: sum(a => a.transcriptsDue + a.summariesDue),
      transcripts_cleared: sum(a => a.transcriptsCleared),
      summaries_cleared: sum(a => a.summariesCleared),
      elevenlabs_deleted: sum(a => a.elevenLabsDeleted),
      errors: sum(a => a.errors.length),
      detail: { agents: own.map(({ userId: _drop, ...rest }) => rest) },
    })
    if (error) console.error(`[cron/retention] Kunde inte logga körningen: ${error.message}`)
  }

  console.log(
    `[cron/retention] ${dryRun ? 'TORRKÖRNING' : 'SKARP'} — ${result.scanned} granskade, ` +
    `${result.transcriptsCleared} transkript och ${result.summariesCleared} sammanfattningar tömda, ` +
    `${result.elevenLabsDeleted} raderade hos ElevenLabs, ${result.errors} fel`,
  )

  return NextResponse.json({
    ok: true,
    dryRun,
    live,
    scanned: result.scanned,
    transcriptsCleared: result.transcriptsCleared,
    summariesCleared: result.summariesCleared,
    elevenLabsDeleted: result.elevenLabsDeleted,
    errors: result.errors,
    agents: result.agents,
  })
}
