'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FiAlertTriangle, FiRefreshCw } from 'react-icons/fi'
import LooprLogo from '@/app/components/LooprLogo'
import { useBookings } from '@/app/components/useBookings'
import type { ClientStatus } from '@/lib/client-status'
import type { PublicCall, PublicCallUpdate, PublicCallsResponse } from '@/lib/public-calls'
import { toStockholm } from '@/lib/stockholm-time'
import AccountView, { type AccountData } from './bos/AccountView'
import CalendarView from './bos/CalendarView'
import CasePanel from './bos/CasePanel'
import { Board, BoardSkeleton, ProcessingNotice, Toolbar } from './bos/CasesView'
import {
  NO_FILTERS, applyFilters, groupLabel, groupOf, newSince, relativeWhen, weekStats,
  type Filters, type GroupKey,
} from './bos/logic'
import { Skeleton, cx } from './bos/ui'
import { markVisited, readBaseline, rememberClientMode } from './bos/visit'
import s from './bos/bos.module.css'

// BOS — sidan en betalande klient använder varje dag: /master/[shareId] med
// agenten i klientläge (agents.client_mode, 029). Ärenden, kalender och konto,
// inget annat: ingen säljtext, ingen demo. Master-routen skickar inte ens
// säljinnehållet i det här läget (app/api/public-agent/[shareId]/master).
//
// Sidan är byggd för en vanlig datorskärm: översikt överst, ärendena i en
// kolumn per status, och det valda ärendet i en panel bredvid listan. På en
// smal skärm staplas kolumnerna och panelen läggs ovanpå.

export interface ClientPageData {
  mode: 'client'
  business: { agentName: string; businessName: string | null }
  /** Whether the calls section is switched on for this link. */
  calls: boolean
  account: AccountData
}

export type CallsState = 'loading' | 'ready' | 'error'

type View = 'arenden' | 'kalender' | 'konto'

const VIEWS: { key: View; label: string }[] = [
  { key: 'arenden', label: 'Ärenden' },
  { key: 'kalender', label: 'Kalender' },
  { key: 'konto', label: 'Ert konto' },
]

// Hur ofta listan hämtas om medan sidan är öppen och synlig — och tätare när
// ett samtal håller på att bearbetas.
const REFRESH_MS = 120_000
const PROCESSING_REFRESH_MS = 20_000
// En statusändring som just gjorts här vinner över en omladdning som hann
// starta innan den sparades.
const LOCAL_WINS_MS = 15_000

interface Toast {
  id: number
  text: string
  undo?: () => void
  error?: boolean
}

function readHash(): { view: View; ref: string | null } {
  const hash = typeof window === 'undefined' ? '' : window.location.hash.slice(1)
  const ref = hash.match(/^samtal-([0-9a-f]{32})$/)?.[1] ?? null
  if (ref) return { view: 'arenden', ref }
  if (hash === 'kalender') return { view: 'kalender', ref: null }
  if (hash === 'konto') return { view: 'konto', ref: null }
  return { view: 'arenden', ref: null }
}

function setHash(hash: string) {
  try {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${hash}`)
  } catch {
    // Bara adressraden som inte uppdateras.
  }
}

export default function ClientView({
  shareId,
  data,
  calls,
  callsState,
  onReloadCalls,
}: {
  shareId: string
  data: ClientPageData
  /** Senast hämtade samtal. Null tills första hämtningen är klar. */
  calls: PublicCallsResponse | null
  callsState: CallsState
  onReloadCalls: () => Promise<void>
}) {
  const name = data.business.businessName || data.business.agentName
  const bookings = useBookings(shareId)

  const [view, setView] = useState<View>(() => (data.calls ? readHash().view : 'kalender'))
  const [selectedRef, setSelectedRef] = useState<string | null>(() => readHash().ref)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [list, setList] = useState<PublicCall[]>(calls?.calls ?? [])
  const [busyRef, setBusyRef] = useState<string | null>(null)
  const [flashRef, setFlashRef] = useState<string | null>(null)
  const [calendarFocus, setCalendarFocus] = useState<{ date: string; n: number } | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [loadedAt, setLoadedAt] = useState<Date | null>(calls ? new Date() : null)
  const [{ previous }] = useState(() => readBaseline(shareId))
  const local = useRef(new Map<string, { status?: ClientStatus; note?: string | null; at: number }>())
  const openedFrom = useRef<HTMLElement | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => { document.title = `${name} · Ärenden och bokningar` }, [name])
  useEffect(() => { rememberClientMode(shareId, true) }, [shareId])

  // Senaste besöket flyttas fram när fliken lämnas, inte bara när den öppnas.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') markVisited(shareId) }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
    }
  }, [shareId])

  // Ny lista från servern. En ändring som just gjorts här behålls tills servern hunnit ikapp.
  useEffect(() => {
    if (!calls) return
    const now = Date.now()
    setList(calls.calls.map(c => {
      const o = c.ref ? local.current.get(c.ref) : undefined
      if (!o || now - o.at > LOCAL_WINS_MS) return c
      return { ...c, ...(o.status ? { status: o.status } : {}), ...(o.note !== undefined ? { note: o.note } : {}) }
    }))
    setLoadedAt(new Date())
  }, [calls])

  // Bokningar som kom med samtalen hamnar i kalenderns lager, så att kort och kalender visar samma sak.
  const { merge } = bookings
  useEffect(() => {
    if (calls) merge(calls.calls.flatMap(c => c.bookings ?? []))
  }, [calls, merge])

  const reload = useCallback(async () => {
    setRefreshing(true)
    try { await onReloadCalls() } finally { setRefreshing(false) }
  }, [onReloadCalls])

  // Hämta om med jämna mellanrum när sidan syns, och direkt när man kommer tillbaka till fliken.
  const processing = calls?.processing ?? 0
  useEffect(() => {
    if (!data.calls) return
    const every = processing > 0 ? PROCESSING_REFRESH_MS : REFRESH_MS
    const timer = setInterval(() => { if (document.visibilityState === 'visible') reload() }, every)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && loadedAt && Date.now() - loadedAt.getTime() > 60_000) reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [data.calls, processing, reload, loadedAt])

  // Bakåt- och framåtknappar, och länkar med #kalender, #konto eller #samtal-<ref>.
  useEffect(() => {
    const onHash = () => {
      const h = readHash()
      setView(data.calls ? h.view : (h.view === 'arenden' ? 'kalender' : h.view))
      if (h.ref) setSelectedRef(h.ref)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [data.calls])

  const selected = useMemo(() => list.find(c => c.ref === selectedRef) ?? null, [list, selectedRef])

  // En länk från notismejlet: visa kortet när listan har kommit.
  const scrolledTo = useRef<string | null>(null)
  useEffect(() => {
    if (!selected?.ref || scrolledTo.current === selected.ref) return
    scrolledTo.current = selected.ref
    const t = setTimeout(() => {
      document.getElementById(`samtal-${selected.ref}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 80)
    return () => clearTimeout(t)
  }, [selected])

  const showToast = useCallback((t: Omit<Toast, 'id'>) => {
    clearTimeout(toastTimer.current)
    setToast({ ...t, id: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), t.undo ? 7000 : 5000)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const flash = useCallback((ref: string) => {
    setFlashRef(ref)
    setTimeout(() => setFlashRef(cur => (cur === ref ? null : cur)), 1700)
  }, [])

  // ── Spara ──────────────────────────────────────────────────────────────────

  const patchCall = useCallback(async (ref: string, update: PublicCallUpdate): Promise<string | null> => {
    try {
      const res = await fetch(`/api/public-agent/${encodeURIComponent(shareId)}/calls/${ref}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) return body?.error || 'Kunde inte spara.'
      local.current.set(ref, { status: body.status, note: body.note, at: Date.now() })
      setList(cs => cs.map(c => (c.ref === ref ? { ...c, status: body.status, note: body.note } : c)))
      return null
    } catch {
      return 'Ingen kontakt med servern. Kontrollera anslutningen och försök igen.'
    }
  }, [shareId])

  const moveCall = useCallback(async (call: PublicCall, status: ClientStatus, undoable = true): Promise<string | null> => {
    if (!call.ref || status === call.status) return null
    const ref = call.ref
    const before = call.status
    setBusyRef(ref)
    setList(cs => cs.map(c => (c.ref === ref ? { ...c, status } : c)))
    const err = await patchCall(ref, { status })
    setBusyRef(null)
    if (err) {
      setList(cs => cs.map(c => (c.ref === ref ? { ...c, status: before } : c)))
      showToast({ text: `Kunde inte flytta ärendet: ${err}`, error: true })
      return err
    }
    const who = call.callerName ?? 'Ärendet'
    const where = groupOf(status) === 'klart' && status === 'bokad' ? 'Klart (bokad)' : groupLabel(groupOf(status))
    setAnnouncement(`${who} flyttades till ${where}.`)
    flash(ref)
    showToast({
      text: `${who} flyttades till ${where}.`,
      undo: undoable ? () => { void moveCall({ ...call, status }, before, false) } : undefined,
    })
    return null
  }, [patchCall, showToast, flash])

  // ── Välja och stänga ───────────────────────────────────────────────────────

  const openCase = useCallback((ref: string) => {
    openedFrom.current = document.activeElement as HTMLElement | null
    setSelectedRef(ref)
    setHash(`samtal-${ref}`)
  }, [])

  const closeCase = useCallback(() => {
    const ref = selectedRef
    setSelectedRef(null)
    setHash('arenden')
    // Tillbaka till kortet man kom från.
    setTimeout(() => {
      const back = openedFrom.current
      if (back && document.contains(back)) back.focus()
      else if (ref) (document.querySelector(`#samtal-${ref} button`) as HTMLElement | null)?.focus()
    }, 0)
  }, [selectedRef])

  useEffect(() => {
    if (!selectedRef || view !== 'arenden') return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const t = e.target as HTMLElement | null
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
      closeCase()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedRef, view, closeCase])

  function go(next: View) {
    setView(next)
    setHash(next === 'arenden' && selectedRef ? `samtal-${selectedRef}` : next)
    window.scrollTo({ top: 0 })
  }

  const showCall = useCallback((ref: string) => {
    setView('arenden')
    // Ett filter som döljer ärendet tas bort, annars hittar man det inte.
    const call = list.find(c => c.ref === ref)
    if (call && applyFilters([call], filters).length === 0) setFilters(NO_FILTERS)
    openedFrom.current = null
    setSelectedRef(ref)
    scrolledTo.current = null
    setHash(`samtal-${ref}`)
    flash(ref)
  }, [list, filters, flash])

  const showInCalendar = useCallback((date: string) => {
    setView('kalender')
    setHash('kalender')
    setCalendarFocus(prev => ({ date, n: (prev?.n ?? 0) + 1 }))
    window.scrollTo({ top: 0 })
  }, [])

  // ── Siffror ────────────────────────────────────────────────────────────────

  const counts = useMemo(() => {
    const c = { nya: 0, vantar: 0, offert: 0, klart: 0 } as Record<GroupKey, number>
    for (const call of list) c[groupOf(call.status)]++
    return c
  }, [list])
  const fresh = useMemo(() => newSince(list, previous), [list, previous])
  const newRefs = useMemo(() => new Set(fresh.map(c => c.ref).filter((r): r is string => Boolean(r))), [fresh])
  const week = useMemo(() => weekStats(list), [list])
  const shownCount = useMemo(() => applyFilters(list, filters).length, [list, filters])

  const loading = callsState === 'loading' && !calls
  const editable = calls?.editable ?? false
  const bookingsOn = Boolean(calls?.bookingsEnabled)

  return (
    <div className={s.root}>
      <header className={s.topbar}>
        <div className={s.topbarInner}>
          <div className={s.brand}>
            <span className={s.logo}><LooprLogo size="sm" /></span>
            <span className={s.brandDivider} aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <h1 className={s.businessName}>{name}</h1>
              <p className={s.tagline}>Ärenden och bokningar från er AI-receptionist</p>
            </div>
          </div>

          <nav className={s.nav} aria-label="Sidans delar">
            {VIEWS.filter(v => v.key !== 'arenden' || data.calls).map(v => (
              <a
                key={v.key}
                href={`#${v.key}`}
                className={cx(s.navLink, view === v.key && s.navLinkActive)}
                aria-current={view === v.key ? 'page' : undefined}
                onClick={e => { e.preventDefault(); go(v.key) }}
              >
                {v.label}
                {v.key === 'arenden' && fresh.length > 0 && (
                  <span className={cx(s.badge, s.badgeRequest)} style={{ height: 20 }} aria-label={`${fresh.length} nya`}>{fresh.length}</span>
                )}
              </a>
            ))}
          </nav>

          <div className={s.topbarEnd}>
            <span className={s.statusPill}>
              <span className={cx(s.statusDot, data.account.receptionistActive && s.statusDotOn)} aria-hidden="true" />
              {data.account.receptionistActive ? 'Receptionisten är aktiv' : 'Receptionisten är pausad'}
            </span>
            {data.calls && (
              <span className={s.updated}>
                {loadedAt ? `Uppdaterad ${toStockholm(loadedAt).time}` : 'Hämtar…'}
                <button type="button" className={s.iconButton} onClick={reload} disabled={refreshing}
                  aria-label="Uppdatera ärendena" title="Uppdatera">
                  <FiRefreshCw aria-hidden="true" size={15} className={refreshing ? s.spin : undefined} />
                </button>
              </span>
            )}
          </div>
        </div>
      </header>

      <main className={s.main}>
        {view === 'arenden' && data.calls && (
          <>
            <Overview
              loading={loading}
              previous={previous}
              freshCount={fresh.length}
              newTotal={counts.nya}
              waiting={counts.vantar}
              week={week}
            />

            <div style={{ marginTop: 16 }}>
              <ProcessingNotice count={processing} />
              {callsState === 'error' && (
                <p className={cx(s.notice, s.noticeError)} role="alert">
                  <FiAlertTriangle aria-hidden="true" size={16} />
                  {calls ? 'Ärendena kunde inte uppdateras just nu. Det du ser är från ' + (loadedAt ? toStockholm(loadedAt).time : 'tidigare') + '.' : 'Ärendena kunde inte hämtas just nu.'}
                  <button type="button" className={cx(s.btn, s.btnSecondary, s.btnSm)} style={{ marginLeft: 'auto' }} onClick={reload} disabled={refreshing}>
                    Försök igen
                  </button>
                </p>
              )}
            </div>

            {!(callsState === 'error' && !calls) && (
              <>
                <Toolbar filters={filters} onChange={setFilters} counts={counts} shown={shownCount} total={list.length} />

                <div className={s.workspace} data-panel={selected ? 'open' : 'closed'}>
                  {loading ? (
                    <BoardSkeleton />
                  ) : (
                    <Board
                      calls={list}
                      filters={filters}
                      selectedRef={selectedRef}
                      flashRef={flashRef}
                      newRefs={newRefs}
                      editable={editable}
                      busyRef={busyRef}
                      onOpen={openCase}
                      onMove={(call, status) => { void moveCall(call, status) }}
                      onClearFilters={() => setFilters(NO_FILTERS)}
                    />
                  )}

                  {selected && (
                    <>
                      <button type="button" className={s.backdrop} onClick={closeCase} aria-label="Stäng ärendet" tabIndex={-1} />
                      <aside className={s.panel} aria-label={`Ärende: ${selected.callerName ?? 'namn saknas'}`}>
                        <CasePanel
                          call={selected}
                          editable={editable}
                          bookings={bookingsOn ? bookings : undefined}
                          query={filters.query}
                          busy={busyRef === selected.ref}
                          onClose={closeCase}
                          onMove={status => moveCall(selected, status)}
                          onSaveNote={async note => {
                            const err = await patchCall(selected.ref!, { note })
                            if (!err) setAnnouncement('Anteckningen är sparad.')
                            return err
                          }}
                          onShowInCalendar={showInCalendar}
                        />
                      </aside>
                    </>
                  )}
                </div>
              </>
            )}
          </>
        )}

        {view === 'kalender' && (
          <>
            <h2 className={s.pageTitle}>Kalender</h2>
            <p className={s.pageIntro} style={{ marginBottom: 16 }}>
              Era bokningar. Välj en dag för att se eller lägga till en bokning, eller boka in ett ärende som väntar.
            </p>
            <CalendarView
              api={bookings}
              focus={calendarFocus}
              calls={data.calls && bookingsOn ? list : []}
              onShowCall={data.calls ? showCall : undefined}
              onMove={(call, status) => moveCall(call, status)}
            />
          </>
        )}

        {view === 'konto' && (
          <>
            <h2 className={s.pageTitle}>Ert konto</h2>
            <p className={s.pageIntro} style={{ marginBottom: 16 }}>Receptionisten, notiser och hjälp.</p>
            <AccountView shareId={shareId} name={name} account={data.account} />
          </>
        )}

        <footer className={s.footer}>
          <span>Drivs av</span>
          <LooprLogo size="sm" />
        </footer>
      </main>

      {toast && (
        <div key={toast.id} className={s.toast} role={toast.error ? 'alert' : 'status'}>
          {toast.error && <FiAlertTriangle aria-hidden="true" size={16} />}
          <span>{toast.text}</span>
          {toast.undo && (
            <button type="button" className={s.toastAction} onClick={() => { toast.undo?.(); setToast(null) }}>
              Ångra
            </button>
          )}
        </div>
      )}
      <p className={s.srOnly} aria-live="polite">{announcement}</p>
    </div>
  )
}

function Overview({
  loading,
  previous,
  freshCount,
  newTotal,
  waiting,
  week,
}: {
  loading: boolean
  previous: string | null
  freshCount: number
  newTotal: number
  waiting: number
  week: { calls: number; cases: number; offHours: number }
}) {
  const value = (n: number) => (loading ? <Skeleton height={34} width={56} style={{ margin: '3px 0' }} /> : n)

  return (
    <section className={s.overview} aria-label="Översikt">
      <div className={s.tile}>
        {previous ? (
          <>
            <span className={s.tileLabel}>Nya samtal sedan senaste besöket</span>
            <span className={cx(s.tileValue, freshCount > 0 && s.tileValueAccent)}>{value(freshCount)}</span>
            <span className={s.tileCaption}>Senaste besöket: {relativeWhen(previous)}</span>
          </>
        ) : (
          <>
            <span className={s.tileLabel}>Nya samtal</span>
            <span className={cx(s.tileValue, newTotal > 0 && s.tileValueAccent)}>{value(newTotal)}</span>
            <span className={s.tileCaption}>Första besöket i den här webbläsaren</span>
          </>
        )}
      </div>

      <div className={s.tile} data-group="vantar">
        <span className={s.tileLabel}>
          <span className={s.columnDot} aria-hidden="true" />
          Väntar på återkoppling
        </span>
        <span className={s.tileValue}>{value(waiting)}</span>
        <span className={s.tileCaption}>Ärenden där ni har ringt upp</span>
      </div>

      <div className={s.tile}>
        <span className={s.tileLabel}>Denna vecka</span>
        <div className={s.weekStats}>
          <div className={s.weekStat}>
            <span className={s.weekValue}>{value(week.calls)}</span>
            <span className={s.weekLabel}>samtal</span>
          </div>
          <div className={s.weekStat}>
            <span className={s.weekValue}>{value(week.cases)}</span>
            <span className={s.weekLabel}>{week.cases === 1 ? 'nytt ärende' : 'nya ärenden'}</span>
          </div>
          <div className={s.weekStat}>
            <span className={s.weekValue}>{value(week.offHours)}</span>
            <span className={s.weekLabel}>på kväll och helg</span>
          </div>
        </div>
      </div>
    </section>
  )
}

/** Laddningsbilden när sidan redan vet att länken är en klientsida. */
export function ClientSkeleton() {
  return (
    <div className={s.root} aria-busy="true" aria-label="Laddar">
      <header className={s.topbar}>
        <div className={s.topbarInner}>
          <Skeleton height={22} width={70} />
          <Skeleton height={22} width={220} />
          <Skeleton height={36} width={260} style={{ marginLeft: 'auto' }} />
        </div>
      </header>
      <main className={s.main}>
        <div className={s.overview}>
          {[0, 1, 2].map(i => <Skeleton key={i} height={108} style={{ borderRadius: 14 }} />)}
        </div>
        <div style={{ marginTop: 24 }}>
          <BoardSkeleton />
        </div>
      </main>
    </div>
  )
}

