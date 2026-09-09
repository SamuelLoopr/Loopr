'use client'

import { useEffect, useRef, useCallback } from 'react'

interface ColorBendsProps {
  color?: string
  speed?: number
  frequency?: number
  noise?: number
  bandWidth?: number
  rotation?: number
  fadeTop?: number
  iterations?: number
  intensity?: number
}

function sineNoise(u: number, v: number, t: number): number {
  return (
    Math.sin(u * 2.3 + t * 0.71) * 0.35 +
    Math.sin(v * 1.9 - t * 0.53) * 0.30 +
    Math.sin((u + v) * 1.4 + t * 0.89) * 0.20 +
    Math.sin(u * 4.1 - v * 2.8 + t * 0.37) * 0.15
  )
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

export default function ColorBends({
  color = '#A855F7',
  speed = 0.2,
  frequency = 1.0,
  noise = 0.15,
  bandWidth = 0.14,
  rotation = 90,
  fadeTop = 0.75,
  iterations = 1,
  intensity = 1.3,
}: ColorBendsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const timeRef = useRef<number>(0)
  const prevTsRef = useRef<number>(0)

  const draw = useCallback(
    (timestamp: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      if (prevTsRef.current === 0) prevTsRef.current = timestamp
      const dt = Math.min((timestamp - prevTsRef.current) / 1000, 0.05)
      prevTsRef.current = timestamp
      timeRef.current += dt * speed

      const t = timeRef.current
      const W = canvas.width
      const H = canvas.height
      const [r, g, b] = hexToRgb(color)
      const isMobile = W < 768
      const effIntensity = isMobile ? Math.min(intensity, 0.7) : intensity
      const effFrequency = isMobile ? Math.min(frequency, 0.6) : frequency

      ctx.clearRect(0, 0, W, H)

      // rotation=90 → horizontal bands (scan along y-axis) with top-to-bottom fadeTop.
      // Convention: rotation=0 → vertical bands, rotation=90 → horizontal bands.
      // We rotate by (rotRad - π/2) so that rotation=90 means no canvas rotation
      // (horizontal scanlines stay horizontal).
      const rotRad = (rotation * Math.PI) / 180
      const canvasRot = rotRad - Math.PI / 2
      const diag = Math.sqrt(W * W + H * H)

      const STEPS = isMobile ? 400 : 800
      const period = 1 / Math.max(1, iterations)

      for (let i = 0; i < STEPS; i++) {
        // t0: -0.5 (top/left) → +0.5 (bottom/right) along projection axis
        const t0 = i / STEPS - 0.5

        // Slow drift: shift the entire band gently over time
        const drift = t * 0.06

        // Noise perturbation (undulates the band edge)
        const nv = sineNoise(t0 * effFrequency * 5, t0 * effFrequency * 3, t) * noise
        const pos = t0 + nv + drift

        // Band membership: cycled=0 at band center, ±0.5 at period edges
        // +1.5 offset ensures pos=0 maps to cycled=0 when drift=0
        const cycled = ((pos / period + 1.5) % 1) - 0.5
        const halfBand = (bandWidth / period) / 2
        const dist = Math.abs(cycled) / halfBand

        if (dist >= 1) continue

        // Smooth cubic falloff
        const x = 1 - dist
        const smooth = x * x * (3 - 2 * x)

        // fadeTop: vertical fade — transparent at top (screenPos≈0), opaque at fadeTop
        // screenPos maps projection position to 0=top, 1=bottom
        const screenPos = t0 + 0.5
        const topFade = screenPos < fadeTop
          ? screenPos / Math.max(0.001, fadeTop)
          : 1

        const alpha = Math.min(smooth * topFade * effIntensity * 0.55, 1)
        if (alpha <= 0.002) continue

        // Position of this scanline from canvas center in pixels
        const scanDist = t0 * diag

        ctx.save()
        ctx.translate(W / 2, H / 2)
        ctx.rotate(canvasRot)
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`
        // Wide horizontal strip in local space → band in screen space
        ctx.fillRect(-diag, scanDist - 1, diag * 2, 2)
        ctx.restore()
      }

      rafRef.current = requestAnimationFrame(draw)
    },
    [color, speed, frequency, noise, bandWidth, rotation, fadeTop, iterations, intensity]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    resize()
    window.addEventListener('resize', resize)
    prevTsRef.current = 0
    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
