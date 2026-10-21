'use client'

import { useEffect, useRef, useState } from 'react'
import { FiInbox, FiRefreshCw, FiSearch, FiX } from 'react-icons/fi'
import { CONTACT_REQUEST_LABEL, type PublicCall } from '@/lib/public-calls'
import type { ClientStatus } from '@/lib/client-status'
import {
  GROUPS, QUICK_ACTIONS, applyFilters, filtersActive, formatDuration, fullWhen, groupOf, offHours,
  plural, relativeWhen, searchHit, sortForGroup,
  type Filters, type GroupKey, type StatusFilter, type TimeFilter,
} from './logic'
import { CallNumbers, EmptyState, OffHoursBadge, PromisedCallback, Skeleton, SmsLine, StatusBadge, cx } from './ui'
import s from './bos.module.css'

// Ärendena: verktygsraden (sök och filter) och tavlan med en kolumn per status.
// Allt tillstånd ägs av ClientView; här ritas det bara upp.

const COLUMN_PAGE = 12

export function Toolbar({
  filters,
  onChange,
  counts,
  shown,
  total,
}: {
  filters: Filters
  onChange: (next: Filters) => void
  counts: Record<GroupKey, number>
  shown: number
  total: number
}) {
  const searchRef = useRef<HTMLInputElement>(null)

  // "/" hoppar till sökfältet, som i de flesta verktyg — men inte när man skriver någon annanstans.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const times: [TimeFilter, string][] = [['alla', 'Alla'], ['idag', 'Idag'], ['vecka', 'Denna vecka']]

  return (
    <div className={s.toolbar} role="search" aria-label="Sök och filtrera ärenden">
      <div className={s.search}>
        <FiSearch className={s.searchIcon} aria-hidden="true" size={16} />
        <label htmlFor="bos-sok" className={s.srOnly}>Sök på namn, nummer eller text</label>
        <input
          id="bos-sok"
          ref={searchRef}
          type="search"
          className={s.searchInput}
          placeholder="Sök namn, nummer eller text"
          aria-keyshortcuts="/"
          value={filters.query}
          onChange={e => onChange({ ...filters, query: e.target.value })}
          onKeyDown={e => { if (e.key === 'Escape' && filters.query) { e.stopPropagation(); onChange({ ...filters, query: '' }) } }}
          autoComplete="off"
        />
        {!filters.query && <kbd className={s.kbd} aria-hidden="true" title="Tryck / för att söka">/</kbd>}
        {filters.query && (
          <button type="button" className={s.searchClear} onClick={() => { onChange({ ...filters, query: '' }); searchRef.current?.focus() }}
            aria-label="Töm sökfältet">
            <FiX aria-hidden="true" size={15} />
          </button>
        )}
      </div>

      <div className={s.segmented} role="group" aria-label="Tid">
        {times.map(([key, label]) => (
          <button key={key} type="button" className={s.segment} aria-pressed={filters.time === key}
            onClick={() => onChange({ ...filters, time: key })}>
            {label}
          </button>
        ))}
      </div>

      <label htmlFor="bos-status" className={s.srOnly}>Status</label>
      <select
        id="bos-status"
        className={s.select}
        value={filters.status}
        onChange={e => onChange({ ...filters, status: e.target.value as StatusFilter })}
      >
        <option value="alla">Alla statusar</option>
        {GROUPS.map(g => (
          <option key={g.key} value={g.key}>{g.label} ({counts[g.key]})</option>
        ))}
      </select>

      <p className={s.resultInfo} aria-live="polite">
        {filtersActive(filters) ? (
          <>
            Visar {shown} av {plural(total, 'ärende', 'ärenden')}
            <button type="button" className={s.linkButton} onClick={() => onChange({ query: '', time: 'alla', status: 'alla' })}>
              Rensa filter
            </button>
          </>
        ) : (
          plural(total, 'ärende', 'ärenden')
        )}
      </p>
    </div>
  )
}

export function Board({
  calls,
  filters,
  selectedRef,
  flashRef,
  newRefs,
  editable,
  busyRef,
  onOpen,
  onMove,
  onClearFilters,
}: {
  calls: PublicCall[]
  filters: Filters
  selectedRef: string | null
  flashRef: string | null
  newRefs: Set<string>
  editable: boolean
  busyRef: string | null
  onOpen: (ref: string) => void
  onMove: (call: PublicCall, status: ClientStatus) => void
  onClearFilters: () => void
}) {
  const [expanded, setExpanded] = useState<Partial<Record<GroupKey, boolean>>>({})
  const visible = applyFilters(calls, filters)

  if (calls.length === 0) {
    return (
      <EmptyState
        icon={<FiInbox size={24} />}
        title="Inga samtal ännu"
        text="När er AI-receptionist har tagit ett samtal dyker det upp här, med en sammanfattning och vad kunden vill. Slår ni på notiser under Ert konto får ni ett mejl för varje samtal."
      >
        <a className={cx(s.btn, s.btnSecondary)} href="#konto">Ställ in notiser</a>
      </EmptyState>
    )
  }

  if (visible.length === 0) {
    return (
      <EmptyState
        icon={<FiSearch size={24} />}
        title="Inga ärenden matchar"
        text={filters.query.trim()
          ? `Inget ärende innehåller ”${filters.query.trim()}” med de filter som är valda.`
          : 'Inget ärende passar de filter som är valda.'}
      >
        <button type="button" className={cx(s.btn, s.btnSecondary)} onClick={onClearFilters}>Rensa filter</button>
      </EmptyState>
    )
  }

  const groups = filters.status === 'alla' ? GROUPS : GROUPS.filter(g => g.key === filters.status)

  return (
    <div className={s.board} data-single={groups.length === 1}>
      {groups.map(group => {
        const inGroup = sortForGroup(group.key, visible.filter(c => groupOf(c.status) === group.key))
        // Det valda ärendet ska alltid synas, även längre ner än första sidan.
        const selectedIndex = inGroup.findIndex(c => c.ref === selectedRef)
        const limit = expanded[group.key] ? inGroup.length : Math.max(COLUMN_PAGE, selectedIndex + 1)
        const shown = inGroup.slice(0, limit)
        const headingId = `kolumn-${group.key}`
        return (
          <section key={group.key} className={s.column} data-group={group.key} aria-labelledby={headingId}>
            <div className={s.columnHeader}>
              <span className={s.columnDot} aria-hidden="true" />
              <h2 id={headingId} className={s.columnTitle}>{group.label}</h2>
              <span className={s.countPill} aria-label={plural(inGroup.length, 'ärende', 'ärenden')}>{inGroup.length}</span>
            </div>
            {inGroup.length === 0 ? (
              <p className={s.columnEmpty}>{group.empty}</p>
            ) : (
              <ul className={s.columnBody}>
                {shown.map((call, i) => (
                  <CaseCard
                    key={call.ref ?? `${group.key}-${i}`}
                    call={call}
                    query={filters.query}
                    selected={call.ref !== null && call.ref === selectedRef}
                    flash={call.ref !== null && call.ref === flashRef}
                    isNew={call.ref !== null && newRefs.has(call.ref)}
                    editable={editable}
                    busy={call.ref !== null && call.ref === busyRef}
                    onOpen={onOpen}
                    onMove={onMove}
                  />
                ))}
              </ul>
            )}
            {inGroup.length > shown.length && (
              <button type="button" className={cx(s.btn, s.btnGhost, s.btnSm, s.showMore)}
                onClick={() => setExpanded(prev => ({ ...prev, [group.key]: true }))}>
                Visa {inGroup.length - shown.length} till
              </button>
            )}
          </section>
        )
      })}
    </div>
  )
}

function CaseCard({
  call,
  query,
  selected,
  flash,
  isNew,
  editable,
  busy,
  onOpen,
  onMove,
}: {
  call: PublicCall
  query: string
  selected: boolean
  flash: boolean
  isNew: boolean
  editable: boolean
  busy: boolean
  onOpen: (ref: string) => void
  onMove: (call: PublicCall, status: ClientStatus) => void
}) {
  const group = groupOf(call.status)
  const waiting = Boolean(call.contactRequest) && call.status === 'ny'
  const off = offHours(call.startedAt)
  const name = call.callerName
  const canMove = editable && call.ref !== null
  const onlyInTranscript = query.trim() !== '' && searchHit(call, query) === 'samtal'
  const actions = group === 'klart' ? [] : QUICK_ACTIONS.filter(a => a.group !== group)
  const duration = formatDuration(call.durationSec)

  return (
    <li
      id={call.ref ? `samtal-${call.ref}` : undefined}
      className={cx(s.card, waiting && s.cardWaiting, selected && s.cardSelected, flash && s.cardFlash)}
      aria-current={selected ? 'true' : undefined}
    >
      <div className={s.cardTop}>
        {call.ref ? (
          <button type="button" className={s.openButton} onClick={() => onOpen(call.ref!)}
            aria-label={`Öppna ärendet: ${name ?? 'namn saknas'}, ${relativeWhen(call.startedAt)}`}>
            <span className={cx(s.name, !name && s.nameMissing)}>
              {isNew && <span className={cx(s.badge, s.badgeNew)} style={{ marginRight: 6, height: 18, fontSize: 11 }}>Ny</span>}
              {name ?? 'Namn saknas'}
            </span>
          </button>
        ) : (
          <span className={cx(s.name, !name && s.nameMissing)} style={{ flex: 1 }}>{name ?? 'Namn saknas'}</span>
        )}
        <time className={s.when} dateTime={call.startedAt}
          title={`${fullWhen(call.startedAt)}${duration ? ` · ${duration}` : ''}`}>
          {relativeWhen(call.startedAt)}
        </time>
      </div>

      <CallNumbers from={call.callbackNumber} given={call.givenNumber} />
      {call.promisedCallback && <PromisedCallback label={call.promisedCallback} />}
      {call.sms && <SmsLine sms={call.sms} compact />}

      <div className={s.metaRow}>
        {call.contactRequest && (
          <span className={cx(s.badge, s.badgeRequest)}>
            Vill bli kontaktad · {CONTACT_REQUEST_LABEL[call.contactRequest]}
          </span>
        )}
        <OffHoursBadge kind={off} />
        <StatusBadge status={call.status} />
      </div>

      {call.contactNote && <p className={s.want}>{call.contactNote}</p>}
      <p className={s.summary}>{call.summary}</p>
      {onlyInTranscript && <p className={s.hitNote}>Sökordet finns i samtalet.</p>}

      {canMove && actions.length > 0 && (
        <div className={cx(s.cardFooter, s.lift)}>
          {actions.map(a => (
            <button
              key={a.status}
              type="button"
              className={cx(s.btn, s.btnSecondary, s.btnSm, s.quick)}
              data-group={a.group}
              disabled={busy}
              onClick={() => onMove(call, a.status)}
              title={`Flytta till ${GROUPS.find(g => g.key === a.group)?.label}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </li>
  )
}

export function BoardSkeleton() {
  return (
    <div className={s.board} aria-hidden="true">
      {GROUPS.map(g => (
        <div key={g.key} className={s.column} data-group={g.key}>
          <div className={s.columnHeader}>
            <span className={s.columnDot} />
            <span className={s.columnTitle}>{g.label}</span>
          </div>
          <div className={s.columnBody}>
            {[0, 1].map(i => <Skeleton key={i} height={g.key === 'nya' ? 150 : 110} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ProcessingNotice({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <p className={s.notice} role="status">
      <FiRefreshCw className={s.spin} aria-hidden="true" size={15} />
      {count === 1 ? 'Ett samtal bearbetas just nu.' : `${count} samtal bearbetas just nu.`} Det dyker upp här inom någon minut.
    </p>
  )
}
