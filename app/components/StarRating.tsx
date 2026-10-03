'use client'

import { useState } from 'react'

// Fem stjärnor att klicka i. Används både i röstväljarens rullgardin och i
// betygspanelen under den.
//
// Varför stjärnor och inte tumme upp/ner: syftet är att RANGORDNA 55 röster.
// Tre nivåer räcker inte för att skilja dem åt, och "sortera efter mitt betyg"
// blir meningslöst om halva listan delar samma värde.
//
// Klick på samma stjärna igen nollar betyget, så en felklickad röst går att
// ångra utan en extra rensa-knapp.
//
// Sitter som `accessory` i Dropdown, alltså som syskon till alternativknappen —
// men klicket måste ändå stoppas uttryckligen, annars stänger rullgardinen
// eller väljer rösten. Samma sak som VoicePreview gör.

export default function StarRating({
  value,
  onChange,
  label,
  size = 13,
  disabled = false,
}: {
  /** 1–5, eller null för obetygsatt. */
  value: number | null
  onChange: (next: number | null) => void
  /** Röstens namn, för skärmläsare. */
  label: string
  size?: number
  disabled?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0

  return (
    <span
      role="group"
      aria-label={`Betyg för ${label}`}
      style={{ display: 'inline-flex', gap: 1, flexShrink: 0, lineHeight: 1 }}
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map(n => {
        const lit = n <= shown
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            aria-label={value === n ? `Ta bort betyget ${n} för ${label}` : `Ge ${label} betyg ${n} av 5`}
            aria-pressed={value != null && n <= value}
            title={value === n ? 'Klicka igen för att nolla' : `${n} av 5`}
            onMouseEnter={() => !disabled && setHover(n)}
            onClick={e => {
              // Annars väljs rösten och rullgardinen stängs.
              e.preventDefault()
              e.stopPropagation()
              if (disabled) return
              onChange(value === n ? null : n)
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: '1px 0',
              margin: 0,
              fontSize: size,
              lineHeight: 1,
              cursor: disabled ? 'default' : 'pointer',
              color: lit ? 'var(--gold, #fbbf24)' : 'rgba(255,255,255,0.22)',
              transition: 'color 90ms',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <span aria-hidden="true">{lit ? '★' : '☆'}</span>
          </button>
        )
      })}
    </span>
  )
}
