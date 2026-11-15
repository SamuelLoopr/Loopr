import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveCname, resolveTxt } from 'node:dns/promises'
import { describeLongCall, findLongCalls } from '@/lib/long-calls'

// Morgonkontrollen (/api/cron/health): letar efter det som tystnade i
// november 2026 — samtal som inte kom fram, notiser som inte gick ut och en
// Resend-domän vars DNS-poster försvunnit eller ändrats — plus ElevenLabs credits.
//
// Bara läsning. Returnerar en rad per problem, utan personuppgifter: antal,
// kundens namn och tider. Tom lista = allt ser bra ut.

const DAY_MS = 24 * 60 * 60 * 1000
/** En analyserad rad som inte mejlats efter så här lång tid räknas som missad. */
const NOTIFY_GRACE_MS = 30 * 60 * 1000
/** Varna när mindre än så här mycket av ElevenLabs credits är kvar. */
const CREDITS_WARN_SHARE = 0.2

const TIME = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * `notes` fylls med det som inte är problem men ska synas i cron_runs, till
 * exempel att Resend-DNS inte gick att fråga.
 */
export async function checkHealth(supabase: SupabaseClient, now: Date = new Date(), notes: string[] = []): Promise<string[]> {
  const problems: string[] = []
  const since = new Date(now.getTime() - DAY_MS).toISOString()

  const { data: agents } = await supabase.from('agents').select('id, business_name, name, notification_email, client_mode')
  const nameOf = (id: string | null) => {
    const a = (agents ?? []).find(x => x.id === id)
    return a?.business_name?.trim() || a?.name || 'okänd agent'
  }

  // ── Samtal som inte kom fram ──────────────────────────────────────────────
  // Tysta samtal ("avslutades utan att något sades") är uppringare som la på,
  // inget fel hos oss, och räknas inte.
  const { data: failed, error: failedError } = await supabase
    .from('call_logs')
    .select('agent_id, created_at, error_message')
    .eq('status', 'error')
    .gte('created_at', since)
    .lt('created_at', now.toISOString())
    .not('error_message', 'ilike', '%utan att något sades%')
    .order('created_at')
  if (failedError) problems.push(`Kunde inte läsa misslyckade samtal: ${failedError.message}`)
  for (const [agentId, rows] of groupBy(failed ?? [], r => r.agent_id as string | null)) {
    problems.push(`${rows.length} samtal till ${nameOf(agentId)} kom inte fram (${TIME.format(new Date(rows[0].created_at))}–${TIME.format(new Date(rows[rows.length - 1].created_at))}).`)
  }

  // Rader som fastnat som pågående: ElevenLabs har aldrig rapporterat dem.
  const { count: stuck } = await supabase
    .from('call_logs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'in_progress')
    .gte('created_at', since)
    .lt('created_at', new Date(now.getTime() - 60 * 60 * 1000).toISOString())
  if (stuck) problems.push(`${stuck} samtal har stått som pågående i mer än en timme.`)

  // ── Linjer som fastnat hos 46elks (mer än 15 minuter) ─────────────────────
  const long = await findLongCalls(now)
  if (long === null) problems.push('46elks samtalshistorik gick inte att läsa.')
  for (const c of long ?? []) problems.push(describeLongCall(c))

  // ── Notiser som inte gick ut ──────────────────────────────────────────────
  // Bara kunder som får notiser: klientläge och en adress satt.
  for (const a of agents ?? []) {
    if (!a.client_mode || !a.notification_email) continue
    const { count } = await supabase
      .from('call_logs')
      .select('id', { count: 'exact', head: true })
      .eq('agent_id', a.id)
      .eq('status', 'completed')
      .not('insight_version', 'is', null)
      .is('notified_at', null)
      .gte('created_at', since)
      .lt('created_at', new Date(now.getTime() - NOTIFY_GRACE_MS).toISOString())
    if (count) problems.push(`${count} samtal till ${nameOf(a.id)} har analyserats men inget notismejl har gått ut.`)
  }

  // ── Resend-domänen (DNS) ──────────────────────────────────────────────────
  // Läser DNS i stället för Resends API: nyckeln i drift får bara skicka, och
  // /domains svarade därför 401 varje morgon. Larmar bara om DKIM-posten
  // eller returadressens CNAME saknas eller har ändrats; ett tillfälligt
  // DNS-fel loggas bara (notes).
  problems.push(...(await checkResendDns(notes)))

  // ── ElevenLabs credits ────────────────────────────────────────────────────
  const elevenKey = process.env.ELEVENLABS_API_KEY
  if (elevenKey) {
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': elevenKey }, signal: AbortSignal.timeout(10_000) })
      const sub = (await res.json()) as { tier?: string; character_count?: number; character_limit?: number; status?: string }
      if (!res.ok) problems.push(`ElevenLabs svarade ${res.status} på abonnemangskontrollen.`)
      else {
        if (sub.status && sub.status !== 'active') problems.push(`ElevenLabs-abonnemanget är ${sub.status}.`)
        const limit = sub.character_limit ?? 0
        const left = limit - (sub.character_count ?? 0)
        if (limit > 0 && left / limit < CREDITS_WARN_SHARE) {
          problems.push(`ElevenLabs: ${Math.round((left / limit) * 100)} % av månadens credits kvar (${sub.tier ?? '?'}).`)
        }
      }
    } catch {
      problems.push('ElevenLabs gick inte att nå för abonnemangskontrollen.')
    }
  }

  return problems
}

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const r of rows) out.set(key(r), [...(out.get(key(r)) ?? []), r])
  return out
}

/**
 * DKIM-nyckeln Resend gav tryloopr.se (publik, står i DNS). Byts den hos
 * Resend måste den bytas här också, annars larmar morgonkontrollen.
 */
const RESEND_DKIM_HOST = 'resend._domainkey.tryloopr.se'
const RESEND_DKIM = 'p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCm+UULyBmnWS1U7KkDI+5GJ+5xhOMv1FzjEXbpz+vRRZ7KleMpe8qgPFitb0/JTbR8H7xEqgRoeSfJXEJkZfFmvanyI4Vt3o6LVmm6A2mtf8aISLlOhGSzRGEfvJLQwQvC7vjjgUiqD4RkTPYvCGFs21e0m1ujbaBwgD57e3LKAwIDAQAB'
const RESEND_RETURN_HOST = 'rsend.tryloopr.se'
const RESEND_RETURN_TARGET = 'rsend-euw1.forge.rmta.net'

/** Posten finns inte: NXDOMAIN eller inga poster av den sorten. */
const MISSING = new Set(['ENOTFOUND', 'ENODATA'])
/** Väntan före det andra försöket när DNS-uppslagningen fallerar tillfälligt. */
const DNS_RETRY_MS = 3000

/**
 * Slår upp en post. 'missing' = posten finns inte. Andra fel (timeout,
 * SERVFAIL …) prövas en gång till efter DNS_RETRY_MS; fallerar det igen blir
 * svaret 'unknown', vilket inte larmar.
 */
async function lookup<T>(fn: () => Promise<T>): Promise<T | 'missing' | 'unknown'> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (MISSING.has((err as NodeJS.ErrnoException).code ?? '')) return 'missing'
      if (attempt === 0) await new Promise(r => setTimeout(r, DNS_RETRY_MS))
    }
  }
  return 'unknown'
}

/**
 * Problem med Resends DNS-poster. Gick DNS inte att fråga (två tillfälliga fel
 * i rad) läggs en rad i `notes` i stället, så att den loggas i cron_runs utan
 * att larma.
 */
export async function checkResendDns(notes: string[] = []): Promise<string[]> {
  const problems: string[] = []
  let unknown = false

  const txt = await lookup(() => resolveTxt(RESEND_DKIM_HOST))
  if (txt === 'missing') problems.push(`DKIM-posten ${RESEND_DKIM_HOST} saknas i DNS. Notismejlen kan stoppas.`)
  else if (txt === 'unknown') unknown = true
  else if (!txt.map(parts => parts.join('').replace(/\s+/g, '')).includes(RESEND_DKIM)) {
    problems.push(`DKIM-posten ${RESEND_DKIM_HOST} har ändrats. Notismejlen kan hamna i skräpposten eller stoppas.`)
  }

  const cname = await lookup(() => resolveCname(RESEND_RETURN_HOST))
  if (cname === 'missing') problems.push(`${RESEND_RETURN_HOST} saknas i DNS (ska peka på ${RESEND_RETURN_TARGET}).`)
  else if (cname === 'unknown') unknown = true
  else if (!cname.map(h => h.replace(/\.$/, '').toLowerCase()).includes(RESEND_RETURN_TARGET)) {
    problems.push(`${RESEND_RETURN_HOST} pekar inte längre på ${RESEND_RETURN_TARGET}.`)
  }

  if (unknown) notes.push('kunde inte kontrollera Resend-DNS')
  return problems
}
