'use client'

import { useState, useRef, useEffect, useCallback, CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface DropdownOption {
  value: string
  label: string
  /**
   * Valfri kontroll till höger om alternativet — t.ex. en lyssna-knapp i
   * röstväljaren. Renderas som syskon till alternativknappen, inte inuti den:
   * knapp i knapp är ogiltig HTML, och ett klick skulle annars både starta
   * tillbehöret och välja alternativet.
   */
  accessory?: ReactNode
}

interface DropdownProps {
  value: string
  onChange: (value: string) => void
  options: DropdownOption[]
  className?: string
  style?: CSSProperties
  placeholder?: string
}

// Native <select> can't be themed on macOS — WebKit ignores background-color
// and color on <option> entirely once the list is open, regardless of CSS.
// This is a fully custom, portal-rendered replacement so it always matches
// the dark UI, in the closed box and in the open list.
export default function Dropdown({ value, onChange, options, className = '', style, placeholder = 'Välj...' }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  const selected = options.find(o => o.value === value)

  const openPanel = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    setOpen(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return
      if (panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }

    // Panelen är position:fixed med koordinater beräknade när den öppnades, så
    // den måste stängas om sidan scrollar — annars blir den hängande kvar en
    // bit från fältet den hör till.
    //
    // Lyssnaren måste vara i capture-fasen (scroll bubblar inte), och det är
    // just det som gjorde att en lista med fler alternativ än panelen rymmer
    // inte gick att bläddra i: panelens EGEN scroll fångades också, och stängde
    // listan vid första hjulrörelsen. Scroll som kommer inifrån panelen är
    // användaren som bläddrar, inte sidan som rör sig.
    const handleScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const handleResize = () => setOpen(false)

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        className={`inline-flex items-center justify-between gap-2 text-left ${className}`}
        style={{
          backgroundColor: 'rgba(255,255,255,0.05)',
          border: `1px solid ${open ? 'rgba(168,85,247,0.5)' : 'rgba(255,255,255,0.1)'}`,
          color: 'var(--cream)',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 14,
          cursor: 'pointer',
          outline: 'none',
          ...style,
        }}
      >
        <span style={{ opacity: selected ? 1 : 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label ?? placeholder}
        </span>
        <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 6, flexShrink: 0 }}>▾</span>
      </button>

      {open && mounted && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            minWidth: coords.width,
            maxHeight: 260,
            overflowY: 'auto',
            backgroundColor: '#1a1023',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            zIndex: 1000,
            padding: 4,
          }}
        >
          {options.map(opt => {
            const isSelected = opt.value === value
            return (
              <div
                key={opt.value}
                className="transition-colors"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 6,
                  paddingRight: opt.accessory ? 8 : 0,
                  backgroundColor: isSelected ? 'rgba(168,85,247,0.18)' : 'transparent',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(168,85,247,0.12)' }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <button
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false) }}
                  className="text-left"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '8px 10px',
                    fontSize: 13,
                    color: isSelected ? 'var(--cream)' : 'rgba(255,255,255,0.75)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {opt.label}
                </button>
                {opt.accessory}
              </div>
            )
          })}
        </div>,
        document.body
      )}
    </>
  )
}
