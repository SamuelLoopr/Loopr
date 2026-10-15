'use client'

import { useId, useState } from 'react'
import { FiBell, FiHelpCircle, FiMail, FiPhoneCall } from 'react-icons/fi'
import { CONTACT_EMAIL } from '@/lib/contact'
import { formatPhone, plural } from './logic'
import { cx } from './ui'
import s from './bos.module.css'

// "Ert konto": receptionistens status och siffror, notismejlet, support och en
// kort hjälptext om hur BOS används.

export interface AccountData {
  receptionistActive: boolean
  phoneNumbers: string[]
  callsLast30Days: number
  /** Hur många av de bedömda samtalen som blev ett ärende att följa upp. Null innan det går att räkna. */
  followUp: { cases: number; calls: number } | null
  notificationEmail: string | null
}

export default function AccountView({
  shareId,
  name,
  account,
}: {
  shareId: string
  name: string
  account: AccountData
}) {
  return (
    <div className={s.accountGrid}>
      <section className={cx(s.card2, s.accountCard)} aria-labelledby="konto-receptionist">
        <h2 id="konto-receptionist" className={s.accountTitle}>
          <FiPhoneCall aria-hidden="true" size={17} /> AI-receptionisten
        </h2>
        <div className={s.row}>
          <span className={s.rowLabel}>Status</span>
          <span className={s.rowValue} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className={cx(s.statusDot, account.receptionistActive && s.statusDotOn)} aria-hidden="true" />
            {account.receptionistActive ? 'Aktiv – svarar i telefon' : 'Pausad'}
          </span>
        </div>
        <div className={s.row}>
          <span className={s.rowLabel}>Telefonnummer</span>
          <span className={s.rowValue}>
            {account.phoneNumbers.length
              ? account.phoneNumbers.map(formatPhone).join(', ')
              : <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>Inget nummer kopplat än</span>}
          </span>
        </div>
        <div className={s.row}>
          <span className={s.rowLabel}>Samtal senaste 30 dagarna</span>
          <span className={s.rowValue}>{account.callsLast30Days}</span>
        </div>
        {account.followUp && (
          <div className={s.row}>
            <span className={s.rowLabel}>Varav ärenden</span>
            <span className={s.rowValue}>
              {account.followUp.cases} av {plural(account.followUp.calls, 'samtal', 'samtal')} blev ett ärende att följa upp
            </span>
          </div>
        )}
      </section>

      <section className={cx(s.card2, s.accountCard)} aria-labelledby="konto-notiser">
        <h2 id="konto-notiser" className={s.accountTitle}>
          <FiBell aria-hidden="true" size={17} /> Notiser
        </h2>
        <NotificationEmail shareId={shareId} initial={account.notificationEmail} />
      </section>

      <section className={cx(s.card2, s.accountCard)} aria-labelledby="konto-hjalp">
        <h2 id="konto-hjalp" className={s.accountTitle}>
          <FiHelpCircle aria-hidden="true" size={17} /> Så använder ni BOS
        </h2>
        <ol className={s.helpList}>
          <li>Varje samtal hamnar under Nya samtal med en sammanfattning. Står det ”Vill bli kontaktad” väntar kunden på er.</li>
          <li>Ring upp direkt från kortet, eller kopiera numret. Tryck sedan på Ringt upp så flyttas ärendet till Väntar på återkoppling.</li>
          <li>Har ni skickat en offert trycker ni på Offert skickad. När ärendet är avklarat trycker ni på Klar.</li>
          <li>Klicka på ett ärende för att läsa hela sammanfattningen, skriva anteckningar, boka in en tid eller läsa hela samtalet.</li>
          <li>Länken är er nyckel till sidan. Alla som har den kan öppna den, så dela den bara med kollegor.</li>
        </ol>
      </section>

      <section className={cx(s.card2, s.accountCard)} aria-labelledby="konto-support">
        <h2 id="konto-support" className={s.accountTitle}>
          <FiMail aria-hidden="true" size={17} /> Support
        </h2>
        <p className={s.bodyText} style={{ color: 'var(--ink-2)' }}>
          Frågor om kontot, receptionisten eller den här sidan? Mejla oss, så hör vi av oss.
        </p>
        <div className={s.rowActions}>
          <a className={cx(s.btn, s.btnSecondary)} href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Fråga om kontot — ${name}`)}`}>
            <FiMail aria-hidden="true" size={15} /> {CONTACT_EMAIL.toLowerCase()}
          </a>
        </div>
      </section>
    </div>
  )
}

/**
 * Adressen som samtalsnotiserna går till — klientens egen inställning, ändrad
 * här utan inloggning. Sparas via /api/public-agent/[shareId]/settings, som bara
 * tar emot det här fältet och bara för agenten bakom länken.
 */
function NotificationEmail({ shareId, initial }: { shareId: string; initial: string | null }) {
  const [saved, setSaved] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initial ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [justSaved, setJustSaved] = useState(false)
  const fieldId = useId()

  async function save() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/public-agent/${encodeURIComponent(shareId)}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationEmail: draft }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setError(body?.error ?? 'Kunde inte spara.'); return }
      setSaved(body.notificationEmail ?? null)
      setDraft(body.notificationEmail ?? '')
      setEditing(false)
      setJustSaved(true)
    } catch {
      setError('Ingen kontakt med servern. Kontrollera anslutningen och försök igen.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <p className={s.bodyText} style={{ color: 'var(--ink-2)' }}>
        Vi mejlar en sammanfattning så fort ett samtal är klart, med en länk direkt till ärendet.
      </p>
      {!editing ? (
        <>
          <div className={s.row}>
            <span className={s.rowLabel}>Mejla mig vid nya samtal</span>
            <span className={s.rowValue}>{saved ?? <span style={{ color: 'var(--ink-3)' }}>Av</span>}</span>
          </div>
          <div className={s.rowActions}>
            <button type="button" className={cx(s.btn, s.btnSecondary, s.btnSm)}
              onClick={() => { setDraft(saved ?? ''); setError(''); setJustSaved(false); setEditing(true) }}>
              {saved ? 'Ändra adress' : 'Slå på notiser'}
            </button>
            <span aria-live="polite" className={s.ok}>
              {justSaved ? (saved ? 'Sparat. Notiser är på.' : 'Sparat. Notiser är av.') : ''}
            </span>
          </div>
        </>
      ) : (
        <div style={{ marginTop: 12 }}>
          <label htmlFor={fieldId} className={s.label}>E-postadress</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              id={fieldId}
              className={s.input}
              style={{ flex: '1 1 240px', width: 'auto' }}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={draft}
              autoFocus
              placeholder="namn@foretag.se"
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            />
            <button type="button" className={cx(s.btn, s.btnPrimary)} onClick={save} disabled={busy}>
              {busy ? 'Sparar…' : 'Spara'}
            </button>
            <button type="button" className={cx(s.btn, s.btnGhost)} onClick={() => { setEditing(false); setError('') }} disabled={busy}>
              Avbryt
            </button>
          </div>
          <p className={s.help}>Lämna fältet tomt och spara för att stänga av notiserna.</p>
          {error && <p className={s.error} role="alert">{error}</p>}
        </div>
      )}
    </div>
  )
}
