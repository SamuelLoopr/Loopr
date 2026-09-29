'use client'

import { useCallback, useMemo, useState } from 'react'
import type { BookingInput, PublicBooking, PublicBookingsResponse } from '@/lib/public-bookings'

// One store for the client's bookings on their BOS page, shared by the calendar
// and the call cards: a booking made from a call shows in the calendar at once,
// and one moved or deleted in the calendar updates the call's "Bokat" line.
//
// Everything goes through /api/public-agent/[shareId]/bookings; bookings are
// keyed by their public_ref, the only handle the page ever has.

export type BookingPatch = Partial<Omit<BookingInput, 'callRef'>>

export interface BookingsApi {
  /** Every booking the page knows of, in time order. */
  bookings: PublicBooking[]
  /** Add bookings that arrived with another payload (the calls list). */
  merge: (list: PublicBooking[]) => void
  /** Load one window of the calendar. Null when the calendar is not available. */
  loadWindow: (from: Date, to: Date) => Promise<{ editable: boolean } | null>
  create: (input: BookingInput) => Promise<{ booking?: PublicBooking; error?: string }>
  update: (ref: string, patch: BookingPatch) => Promise<{ booking?: PublicBooking; error?: string }>
  remove: (ref: string) => Promise<{ error?: string }>
}

async function send(url: string, method: string, body?: unknown) {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    return { ok: res.ok, json }
  } catch {
    return { ok: false, json: { error: 'Ingen kontakt med servern. Kontrollera anslutningen och försök igen.' } }
  }
}

export function useBookings(shareId: string): BookingsApi {
  const [byRef, setByRef] = useState<Record<string, PublicBooking>>({})
  const base = `/api/public-agent/${encodeURIComponent(shareId)}/bookings`

  const merge = useCallback((list: PublicBooking[]) => {
    if (list.length === 0) return
    setByRef(prev => {
      const next = { ...prev }
      for (const b of list) next[b.ref] = b
      return next
    })
  }, [])

  const loadWindow = useCallback(async (from: Date, to: Date) => {
    const { ok, json } = await send(
      `${base}?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      'GET',
    )
    if (!ok || !json) return null
    const body = json as PublicBookingsResponse
    setByRef(prev => {
      const next = { ...prev }
      // What used to be in this window but is not any more was moved or removed
      // somewhere else (another tab, another person with the link).
      for (const [ref, b] of Object.entries(prev)) {
        if (new Date(b.startsAt) < to && new Date(b.endsAt) > from) delete next[ref]
      }
      for (const b of body.bookings) next[b.ref] = b
      return next
    })
    return { editable: body.editable }
  }, [base])

  const create = useCallback(async (input: BookingInput) => {
    const { ok, json } = await send(base, 'POST', input)
    if (!ok) return { error: json?.error ?? 'Bokningen kunde inte sparas.' }
    const booking = json.booking as PublicBooking
    setByRef(prev => ({ ...prev, [booking.ref]: booking }))
    return { booking }
  }, [base])

  const update = useCallback(async (ref: string, patch: BookingPatch) => {
    const { ok, json } = await send(`${base}/${ref}`, 'PATCH', patch)
    if (!ok) return { error: json?.error ?? 'Bokningen kunde inte sparas.' }
    const booking = json.booking as PublicBooking
    setByRef(prev => ({ ...prev, [booking.ref]: booking }))
    return { booking }
  }, [base])

  const remove = useCallback(async (ref: string) => {
    const { ok, json } = await send(`${base}/${ref}`, 'DELETE')
    if (!ok) return { error: json?.error ?? 'Bokningen kunde inte tas bort.' }
    setByRef(prev => {
      const next = { ...prev }
      delete next[ref]
      return next
    })
    return {}
  }, [base])

  const bookings = useMemo(
    () => Object.values(byRef).sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [byRef],
  )

  return { bookings, merge, loadWindow, create, update, remove }
}
