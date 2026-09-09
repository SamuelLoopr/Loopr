'use client'

import { useRef, useEffect, ReactNode, CSSProperties } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// React Bits FadeContent, converted to TypeScript to match the rest of
// app/components (same treatment as Particles.tsx / ColorBends.tsx).
//
// Reveals its children once, when they scroll into view. Note the prop is
// `ease` and it takes a GSAP easing name ('power2.out' is GSAP's ease-out) —
// CSS easing strings like 'ease-out' are not valid here.
//
// `duration` and `delay` accept milliseconds: values above 10 are divided by
// 1000 internally, so duration={1000} is one second and delay={200} is 0.2s.

gsap.registerPlugin(ScrollTrigger)

export interface FadeContentProps {
  children?: ReactNode
  container?: string | Element | null
  blur?: boolean
  /** Milliseconds (values > 10 are treated as ms). */
  duration?: number
  /** GSAP easing name, e.g. 'power2.out'. Not a CSS easing string. */
  ease?: string
  /** Milliseconds before the reveal starts — this is the stagger lever. */
  delay?: number
  threshold?: number
  initialOpacity?: number
  disappearAfter?: number
  disappearDuration?: number
  disappearEase?: string
  onComplete?: () => void
  onDisappearanceComplete?: () => void
  className?: string
  style?: CSSProperties
}

export default function FadeContent({
  children,
  container,
  blur = false,
  duration = 1000,
  ease = 'power2.out',
  delay = 0,
  threshold = 0.1,
  initialOpacity = 0,
  disappearAfter = 0,
  disappearDuration = 0.5,
  disappearEase = 'power2.in',
  onComplete,
  onDisappearanceComplete,
  className = '',
  style,
  ...props
}: FadeContentProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let scrollerTarget: Element | null =
      (typeof container === 'string' ? document.querySelector(container) : container) ??
      document.getElementById('snap-main-container')

    if (typeof scrollerTarget === 'string') {
      scrollerTarget = document.querySelector(scrollerTarget)
    }

    const startPct = (1 - threshold) * 100

    const getSeconds = (val: number) => (typeof val === 'number' && val > 10 ? val / 1000 : val)

    gsap.set(el, {
      autoAlpha: initialOpacity,
      filter: blur ? 'blur(10px)' : 'blur(0px)',
      willChange: 'opacity, filter, transform',
    })

    const tl = gsap.timeline({
      paused: true,
      delay: getSeconds(delay),
      onComplete: () => {
        if (onComplete) onComplete()
        if (disappearAfter > 0) {
          gsap.to(el, {
            autoAlpha: initialOpacity,
            filter: blur ? 'blur(10px)' : 'blur(0px)',
            delay: getSeconds(disappearAfter),
            duration: getSeconds(disappearDuration),
            ease: disappearEase,
            onComplete: () => onDisappearanceComplete?.(),
          })
        }
      },
    })

    tl.to(el, {
      autoAlpha: 1,
      filter: 'blur(0px)',
      duration: getSeconds(duration),
      ease,
    })

    const st = ScrollTrigger.create({
      trigger: el,
      scroller: scrollerTarget || window,
      start: `top ${startPct}%`,
      once: true,
      onEnter: () => tl.play(),
    })

    return () => {
      st.kill()
      tl.kill()
      gsap.killTweensOf(el)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={ref} className={className} style={style} {...props}>
      {children}
    </div>
  )
}
