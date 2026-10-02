'use client'

import { useEffect, useRef, useState } from 'react'

// Liten spela/pausa-knapp för ett röstprov.
//
// ElevenLabs ger en preview_url på varje röst, både i kontots lista
// (/v1/voices) och i det delade biblioteket (/v1/shared-voices). Länken är
// publik — den svarar 200 audio/mpeg utan API-nyckel och med CORS *, så den
// kan spelas rakt av i webbläsaren utan att gå via vår server.
//
// Används både i röstväljaren i agentens Inställningar och i biblioteks-panelen
// under den, så de två ställena beter sig likadant.

/**
 * Ett enda ljudobjekt för hela sidan: startar man ett nytt prov ska det förra
 * sluta, inte spela vidare under. Modulnivå i stället för per komponent,
 * eftersom knapparna inte känner till varandra.
 */
let current: { audio: HTMLAudioElement; stop: () => void } | null = null

export default function VoicePreview({
  url,
  label,
  size = 26,
}: {
  /** Röstprovets URL. Utan den visas ingen knapp alls. */
  url: string | null | undefined
  /** Röstens namn, för skärmläsare. */
  label: string
  size?: number
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Stoppa om knappen försvinner medan den spelar (t.ex. när listan filtreras).
  useEffect(() => () => {
    if (audioRef.current) {
      audioRef.current.pause()
      if (current?.audio === audioRef.current) current = null
    }
  }, [])

  if (!url) return null

  async function toggle(e: React.MouseEvent) {
    // Knappen sitter bredvid ett alternativ i en lista — klicket får inte
    // också välja rösten eller stänga rullgardinen.
    e.preventDefault()
    e.stopPropagation()

    if (state === 'playing') {
      audioRef.current?.pause()
      return
    }

    current?.stop()

    const audio = audioRef.current ?? new Audio(url!)
    audioRef.current = audio
    audio.onplaying = () => setState('playing')
    audio.onpause = () => setState('idle')
    audio.onended = () => { setState('idle'); if (current?.audio === audio) current = null }
    audio.onerror = () => { setState('error'); if (current?.audio === audio) current = null }

    current = { audio, stop: () => { audio.pause(); audio.currentTime = 0 } }
    setState('loading')
    try {
      await audio.play()
    } catch {
      // Webbläsaren kan neka uppspelning utan användargest, eller nätverket
      // svara fel. Båda syns som ett krysstillstånd på knappen.
      setState('error')
      if (current?.audio === audio) current = null
    }
  }

  const glyph = state === 'playing' ? '⏸' : state === 'loading' ? '⋯' : state === 'error' ? '✕' : '▶'
  const title =
    state === 'error' ? `Kunde inte spela upp ${label}`
      : state === 'playing' ? `Pausa ${label}`
        : `Lyssna på ${label}`

  return (
    <button
      type="button"
      onClick={toggle}
      title={title}
      aria-label={title}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.42, lineHeight: 1, cursor: 'pointer',
        color: state === 'error' ? '#f87171' : state === 'playing' ? 'white' : 'var(--brick)',
        background: state === 'playing' ? 'var(--brick)' : 'rgba(168,85,247,0.14)',
        border: `1px solid ${state === 'error' ? 'rgba(248,113,113,0.4)' : 'rgba(168,85,247,0.35)'}`,
        padding: 0,
      }}
    >
      <span aria-hidden="true" style={{ transform: state === 'idle' ? 'translateX(1px)' : undefined }}>{glyph}</span>
    </button>
  )
}
