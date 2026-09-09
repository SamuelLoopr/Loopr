'use client'

import { useEffect, useMemo, useRef, RefObject } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import './ScrollFloat.css'

// React Bits ScrollFloat, converted to TypeScript to match the rest of
// app/components.
//
// It renders its own <h2> and splits `children` into per-character spans, so
// children must be a plain string. Its CSS ships a very large default type
// scale (clamp(1.6rem, 8vw, 10rem)); pass textClassName to override it when
// used as a normal section heading.

gsap.registerPlugin(ScrollTrigger)

export interface ScrollFloatProps {
  children?: string
  scrollContainerRef?: RefObject<HTMLElement | null>
  containerClassName?: string
  textClassName?: string
  animationDuration?: number
  ease?: string
  scrollStart?: string
  scrollEnd?: string
  stagger?: number
}

export default function ScrollFloat({
  children,
  scrollContainerRef,
  containerClassName = '',
  textClassName = '',
  animationDuration = 1,
  ease = 'back.inOut(2)',
  scrollStart = 'center bottom+=50%',
  scrollEnd = 'bottom bottom-=40%',
  stagger = 0.03,
}: ScrollFloatProps) {
  const containerRef = useRef<HTMLHeadingElement>(null)

  const splitText = useMemo(() => {
    const text = typeof children === 'string' ? children : ''
    return text.split('').map((char, index) => (
      <span className="char" key={index}>
        {char === ' ' ? ' ' : char}
      </span>
    ))
  }, [children])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const scroller = scrollContainerRef && scrollContainerRef.current ? scrollContainerRef.current : window
    const charElements = el.querySelectorAll('.char')

    const tween = gsap.fromTo(
      charElements,
      {
        willChange: 'opacity, transform',
        opacity: 0,
        yPercent: 120,
        scaleY: 2.3,
        scaleX: 0.7,
        transformOrigin: '50% 0%',
      },
      {
        duration: animationDuration,
        ease,
        opacity: 1,
        yPercent: 0,
        scaleY: 1,
        scaleX: 1,
        stagger,
        scrollTrigger: { trigger: el, scroller, start: scrollStart, end: scrollEnd, scrub: true },
      }
    )

    // The upstream component leaks its ScrollTrigger on unmount; clean it up.
    return () => {
      tween.scrollTrigger?.kill()
      tween.kill()
    }
  }, [scrollContainerRef, animationDuration, ease, scrollStart, scrollEnd, stagger])

  return (
    <h2 ref={containerRef} className={`scroll-float ${containerClassName}`}>
      <span className={`scroll-float-text ${textClassName}`}>{splitText}</span>
    </h2>
  )
}
