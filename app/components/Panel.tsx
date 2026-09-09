'use client'

import { ReactNode, CSSProperties, useRef, useEffect, useCallback } from 'react'
import { gsap } from 'gsap'
import './MagicBento.css'

// ─── MagicBento config defaults (per spec) ────────────────────────────────────
const DEFAULT_GLOW_COLOR = '132, 0, 255'
const DEFAULT_PARTICLE_COUNT = 12
const DEFAULT_SPOTLIGHT_RADIUS = 300
const MOBILE_BREAKPOINT = 768

// ─── Global spotlight singleton ───────────────────────────────────────────────
// One cursor-following radial-gradient overlay + one mousemove listener shared
// across every mounted Panel on the page, so N cards don't mean N listeners.
let spotlightRefCount = 0
let spotlightEl: HTMLDivElement | null = null
let spotlightTeardown: (() => void) | null = null

function acquireGlobalSpotlight(spotlightRadius: number) {
  spotlightRefCount++
  // No cursor on touch devices — don't even create the cursor-follow overlay.
  // The live isMobile() check in each card's mousemove handler already keeps
  // this inert if the viewport crosses the breakpoint later, so this is just
  // avoiding pointless DOM/listener setup on an already-mobile viewport.
  if (window.innerWidth <= MOBILE_BREAKPOINT) {
    return () => { spotlightRefCount-- }
  }
  if (spotlightRefCount === 1) {
    const el = document.createElement('div')
    el.className = 'magic-bento-global-spotlight'
    el.style.width = '800px'
    el.style.height = '800px'
    el.style.background = `radial-gradient(circle,
      rgba(${DEFAULT_GLOW_COLOR}, 0.15) 0%,
      rgba(${DEFAULT_GLOW_COLOR}, 0.08) 15%,
      rgba(${DEFAULT_GLOW_COLOR}, 0.04) 25%,
      rgba(${DEFAULT_GLOW_COLOR}, 0.02) 40%,
      transparent 65%)`
    document.body.appendChild(el)
    spotlightEl = el

    const proximity = spotlightRadius * 0.5
    const fadeDistance = spotlightRadius * 0.75

    const handleMouseMove = (e: MouseEvent) => {
      if (window.innerWidth <= MOBILE_BREAKPOINT) return
      const cards = document.querySelectorAll<HTMLElement>('.magic-bento-card[data-spotlight="on"]')
      let minDistance = Infinity

      cards.forEach(card => {
        const rect = card.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2
        const distance = Math.hypot(e.clientX - centerX, e.clientY - centerY) - Math.max(rect.width, rect.height) / 2
        const effectiveDistance = Math.max(0, distance)
        minDistance = Math.min(minDistance, effectiveDistance)

        let intensity = 0
        if (effectiveDistance <= proximity) intensity = 1
        else if (effectiveDistance <= fadeDistance) intensity = (fadeDistance - effectiveDistance) / (fadeDistance - proximity)

        const relX = ((e.clientX - rect.left) / rect.width) * 100
        const relY = ((e.clientY - rect.top) / rect.height) * 100
        card.style.setProperty('--glow-x', `${relX}%`)
        card.style.setProperty('--glow-y', `${relY}%`)
        card.style.setProperty('--glow-intensity', String(intensity))
      })

      if (!spotlightEl) return
      gsap.to(spotlightEl, { left: e.clientX, top: e.clientY, duration: 0.1, ease: 'power2.out' })
      const targetOpacity = cards.length === 0 ? 0
        : minDistance <= proximity ? 0.8
        : minDistance <= fadeDistance ? ((fadeDistance - minDistance) / (fadeDistance - proximity)) * 0.8
        : 0
      gsap.to(spotlightEl, { opacity: targetOpacity, duration: targetOpacity > 0 ? 0.2 : 0.5, ease: 'power2.out' })
    }

    const handleMouseLeaveDoc = () => {
      document.querySelectorAll<HTMLElement>('.magic-bento-card').forEach(card => {
        card.style.setProperty('--glow-intensity', '0')
      })
      if (spotlightEl) gsap.to(spotlightEl, { opacity: 0, duration: 0.3, ease: 'power2.out' })
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseleave', handleMouseLeaveDoc)

    spotlightTeardown = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseleave', handleMouseLeaveDoc)
      spotlightEl?.parentNode?.removeChild(spotlightEl)
      spotlightEl = null
    }
  }

  return () => {
    spotlightRefCount--
    if (spotlightRefCount === 0) {
      spotlightTeardown?.()
      spotlightTeardown = null
    }
  }
}

function createParticle(x: number, y: number, color: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'magic-bento-particle'
  el.style.left = `${x}px`
  el.style.top = `${y}px`
  el.style.background = `rgba(${color}, 1)`
  el.style.boxShadow = `0 0 6px rgba(${color}, 0.6)`
  return el
}

// ─── Panel props ───────────────────────────────────────────────────────────────
interface PanelProps {
  children?: ReactNode
  className?: string
  style?: CSSProperties
  padding?: string
  /** Full MagicBento interactivity (spotlight, glow, particles, tilt, magnetism, click ripple). Default true. */
  magic?: boolean
  /** RGB triplet e.g. "132, 0, 255" — border-glow + particle color for this card. */
  glowColor?: string
  enableStars?: boolean
  enableSpotlight?: boolean
  enableBorderGlow?: boolean
  enableTilt?: boolean
  /** Max rotation in degrees applied by tilt. Default 10. Use a low value (5-8) for wide/short cards instead of disabling tilt entirely. */
  tiltMaxAngle?: number
  /** Physically translates the card toward the cursor on hover. Default false — most cards should only rotate (tilt), never shift position. */
  enableMagnetism?: boolean
  clickEffect?: boolean
  spotlightRadius?: number
  particleCount?: number
}

export default function Panel({
  children,
  className = '',
  style,
  padding = 'p-6',
  magic = true,
  glowColor = DEFAULT_GLOW_COLOR,
  enableStars = true,
  enableSpotlight = true,
  enableBorderGlow = true,
  enableTilt = true,
  tiltMaxAngle = 10,
  enableMagnetism = false,
  clickEffect = true,
  spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS,
  particleCount = DEFAULT_PARTICLE_COUNT,
}: PanelProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const particlesRef = useRef<HTMLDivElement[]>([])
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const isHoveredRef = useRef(false)
  const magnetAnimRef = useRef<gsap.core.Tween | null>(null)

  const clearParticles = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
    particlesRef.current.forEach(p => {
      gsap.to(p, { scale: 0, opacity: 0, duration: 0.25, ease: 'back.in(1.7)', onComplete: () => p.parentNode?.removeChild(p) })
    })
    particlesRef.current = []
  }, [])

  const spawnParticles = useCallback(() => {
    const card = cardRef.current
    if (!card || !isHoveredRef.current) return
    const { width, height } = card.getBoundingClientRect()

    for (let i = 0; i < particleCount; i++) {
      const timeoutId = setTimeout(() => {
        if (!isHoveredRef.current || !cardRef.current) return
        const particle = createParticle(Math.random() * width, Math.random() * height, glowColor)
        cardRef.current.appendChild(particle)
        particlesRef.current.push(particle)

        gsap.fromTo(particle, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' })
        gsap.to(particle, {
          x: (Math.random() - 0.5) * 80,
          y: (Math.random() - 0.5) * 80,
          rotation: Math.random() * 360,
          duration: 2 + Math.random() * 2,
          ease: 'none',
          repeat: -1,
          yoyo: true,
        })
        gsap.to(particle, { opacity: 0.3, duration: 1.5, ease: 'power2.inOut', repeat: -1, yoyo: true })
      }, i * 100)
      timeoutsRef.current.push(timeoutId)
    }
  }, [particleCount, glowColor])

  useEffect(() => {
    if (!magic) return
    const card = cardRef.current
    if (!card) return

    // Checked live inside each handler (not frozen at mount) so a viewport
    // that's briefly narrow during initial paint, or a later resize, can't
    // permanently disable the effect.
    const isMobile = () => window.innerWidth <= MOBILE_BREAKPOINT

    let releaseSpotlight: (() => void) | null = null
    if (enableSpotlight) releaseSpotlight = acquireGlobalSpotlight(spotlightRadius)

    const handleMouseEnter = () => {
      if (isMobile()) return
      isHoveredRef.current = true
      if (enableStars) spawnParticles()
      if (enableTilt) {
        gsap.to(card, { rotateX: tiltMaxAngle / 2, rotateY: tiltMaxAngle / 2, duration: 0.3, ease: 'power2.out', transformPerspective: 1000 })
      }
    }

    const handleMouseLeave = () => {
      isHoveredRef.current = false
      if (enableStars) clearParticles()
      if (enableTilt) gsap.to(card, { rotateX: 0, rotateY: 0, duration: 0.3, ease: 'power2.out' })
      if (enableMagnetism) gsap.to(card, { x: 0, y: 0, duration: 0.3, ease: 'power2.out' })
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (isMobile()) return
      if (!enableTilt && !enableMagnetism) return
      const rect = card.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const centerX = rect.width / 2
      const centerY = rect.height / 2

      if (enableTilt) {
        gsap.to(card, {
          rotateX: ((y - centerY) / centerY) * -tiltMaxAngle,
          rotateY: ((x - centerX) / centerX) * tiltMaxAngle,
          duration: 0.1,
          ease: 'power2.out',
          transformPerspective: 1000,
        })
      }
      if (enableMagnetism) {
        magnetAnimRef.current = gsap.to(card, {
          x: (x - centerX) * 0.05,
          y: (y - centerY) * 0.05,
          duration: 0.3,
          ease: 'power2.out',
        })
      }
    }

    const handleClick = (e: MouseEvent) => {
      if (!clickEffect) return
      const rect = card.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const maxDistance = Math.max(
        Math.hypot(x, y), Math.hypot(x - rect.width, y),
        Math.hypot(x, y - rect.height), Math.hypot(x - rect.width, y - rect.height)
      )
      const ripple = document.createElement('div')
      ripple.style.cssText = `
        position: absolute; width: ${maxDistance * 2}px; height: ${maxDistance * 2}px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(${glowColor}, 0.35) 0%, rgba(${glowColor}, 0.15) 30%, transparent 70%);
        left: ${x - maxDistance}px; top: ${y - maxDistance}px;
        pointer-events: none; z-index: 4;
      `
      card.appendChild(ripple)
      gsap.fromTo(ripple, { scale: 0, opacity: 1 }, {
        scale: 1, opacity: 0, duration: 0.7, ease: 'power2.out',
        onComplete: () => ripple.remove(),
      })
    }

    card.addEventListener('mouseenter', handleMouseEnter)
    card.addEventListener('mouseleave', handleMouseLeave)
    card.addEventListener('mousemove', handleMouseMove)
    card.addEventListener('click', handleClick)

    return () => {
      isHoveredRef.current = false
      card.removeEventListener('mouseenter', handleMouseEnter)
      card.removeEventListener('mouseleave', handleMouseLeave)
      card.removeEventListener('mousemove', handleMouseMove)
      card.removeEventListener('click', handleClick)
      magnetAnimRef.current?.kill()
      clearParticles()
      releaseSpotlight?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magic, enableStars, enableSpotlight, enableBorderGlow, enableTilt, tiltMaxAngle, enableMagnetism, clickEffect, spotlightRadius, glowColor, spawnParticles, clearParticles])

  const magicClasses = magic
    ? `magic-bento-card magic-bento-particle-container ${enableBorderGlow ? 'magic-bento-card--border-glow' : ''}`
    : ''

  return (
    <div
      ref={cardRef}
      data-spotlight={magic && enableSpotlight ? 'on' : 'off'}
      className={`rounded-xl border border-white/10 backdrop-blur-sm ${padding} ${magicClasses} ${className}`}
      style={{
        backgroundColor: 'rgba(21,19,19,0.75)',
        ...(magic ? { ['--glow-color' as string]: glowColor, ['--glow-radius' as string]: `${spotlightRadius}px` } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  )
}
