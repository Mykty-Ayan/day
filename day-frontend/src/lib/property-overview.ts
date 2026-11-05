/** The flat's page at a glance: what is happening in it now, and what it still lacks. */

import type { Booking } from '../types/booking'
import type { PricingConfig, Property } from '../types/property'

type Stay = Pick<Booking, 'id' | 'check_in' | 'check_out' | 'status' | 'rental_mode' | 'guest_name'>

const LIVE = new Set(['pending', 'confirmed', 'checked_in'])
const DAY_MS = 86_400_000

/** The wall clock in `timeZone` at `at`, "YYYY-MM-DDTHH:mm:ss": the way stays' times are written. */
export function wallClock(at: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
}

/** Who is in the flat now, and who comes next. `now` is the flat's wall clock, "YYYY-MM-DDTHH:mm:ss". */
export function stayNow(stays: Stay[], now: string): { current: Stay | null; next: Stay | null } {
  const live = stays.filter((s) => LIVE.has(s.status))
  const current = live.find((s) => s.status === 'checked_in') ?? live.find((s) => s.check_in <= now && now < s.check_out) ?? null
  const next =
    live
      .filter((s) => s.id !== current?.id && s.check_in > now)
      .sort((a, b) => a.check_in.localeCompare(b.check_in))[0] ?? null
  return { current, next }
}

/** The share of the next `days` nights from `from` (YYYY-MM-DD) that daily stays take, 0..1. */
export function occupancy(stays: Stay[], from: string, days: number): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const taken = new Set<number>()
  for (const s of stays) {
    if (s.rental_mode === 'hourly' || !LIVE.has(s.status)) continue
    const first = Date.parse(`${s.check_in.slice(0, 10)}T00:00:00Z`)
    const last = Date.parse(`${s.check_out.slice(0, 10)}T00:00:00Z`)
    for (let night = Math.max(first, start); night < last && night < start + days * DAY_MS; night += DAY_MS) {
      taken.add(night)
    }
  }
  return days > 0 ? taken.size / days : 0
}

/** Where a missing thing is filled in: a tab of the page, or the panel of one block. */
export type ReadinessPlace = 'prices' | 'photos' | 'basic' | 'address' | 'details' | 'rules' | 'amenities'
export interface ReadinessItem {
  key: string
  done: boolean
  place: ReadinessPlace
}

/** What the guest page and the CRM need of a flat, each with where to fill it in. */
export function readiness(property: Property, pricing: PricingConfig | null | undefined): ReadinessItem[] {
  const listing = property.photos.filter((p) => p.audience !== 'guest')
  const checkIn = property.photos.filter((p) => p.audience === 'guest')
  const nightly = property.rental_mode !== 'hourly'
  const hourly = property.rental_mode !== 'daily'
  const priced =
    !!pricing &&
    (!nightly || Number(pricing.base_price) > 0) &&
    (!hourly || Number(pricing.hourly_price) > 0 || [pricing.price_3h, pricing.price_6h, pricing.price_night].some((p) => Number(p) > 0))
  return [
    { key: 'prices', done: priced, place: 'prices' },
    { key: 'photos', done: listing.length >= 3, place: 'photos' },
    { key: 'description', done: Boolean(property.description?.trim()), place: 'basic' },
    { key: 'address', done: Boolean(property.address_full?.trim()), place: 'address' },
    { key: 'guests', done: property.max_guests != null && property.max_guests > 0, place: 'details' },
    { key: 'checkInInstructions', done: Boolean(property.check_in_instructions?.trim()), place: 'rules' },
    { key: 'checkInPhotos', done: checkIn.length > 0, place: 'photos' },
    { key: 'amenities', done: property.amenities.length > 0, place: 'amenities' },
  ]
}
