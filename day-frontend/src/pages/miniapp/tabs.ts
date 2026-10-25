/** Which tab the Mini App shows, kept in the address so a reload or a link from a
 *  bot notice (`?tab=bookings`) lands on the same screen. */

import type { Booking, BookingFilters } from '../../types/booking'
import { addDays, toISODate } from './format'

// "ask" has no place in the bottom bar (five tabs at most): a button in the header opens it.
export const TABS = ['today', 'bookings', 'sell', 'units', 'money', 'ask'] as const
export type Tab = (typeof TABS)[number]

export function tabFromSearch(search: string): Tab {
  const value = new URLSearchParams(search).get('tab')
  return (TABS as readonly string[]).includes(value ?? '') ? (value as Tab) : 'today'
}

/** The same address with another tab; the other parameters stay. */
export function searchWithTab(search: string, tab: Tab): string {
  const params = new URLSearchParams(search)
  if (tab === 'today') params.delete('tab')
  else params.set('tab', tab)
  const next = params.toString()
  return next ? `?${next}` : ''
}

export type BookingSegment = 'upcoming' | 'past' | 'cancelled'

// Upcoming is one page read ahead and sorted here; the server sorts newest first,
// which would page from the far end of the calendar.
export const UPCOMING_WINDOW_DAYS = 30
export const PAGE_SIZE = 30

export function segmentFilters(
  segment: BookingSegment,
  today: Date,
  search: string,
  page = 1,
  propertyId = '',
): BookingFilters {
  const base: BookingFilters = { search: search.trim() || undefined, property_id: propertyId || undefined }
  if (segment === 'upcoming') {
    return { ...base, date_from: toISODate(today), date_to: toISODate(addDays(today, UPCOMING_WINDOW_DAYS)), per_page: 100 }
  }
  if (segment === 'past') return { ...base, date_to: toISODate(today), per_page: PAGE_SIZE, page }
  return { ...base, status: 'cancelled', per_page: PAGE_SIZE, page }
}

export function owes(booking: Booking): boolean {
  return booking.total_price - (booking.paid_amount ?? 0) > 0
}

/** What the server's date window lets through but the segment does not mean:
 *  a stay that ends today is past once the guest left, not upcoming. */
export function segmentItems(segment: BookingSegment, items: Booking[], now: Date, unpaidOnly: boolean): Booking[] {
  const at = now.getTime()
  const kept = items.filter((booking) => {
    if (unpaidOnly && !owes(booking)) return false
    if (segment === 'cancelled') return booking.status === 'cancelled'
    if (booking.status === 'cancelled') return false
    const leaves = new Date(booking.check_out).getTime()
    return segment === 'upcoming' ? leaves > at : leaves <= at
  })
  if (segment === 'upcoming') kept.sort((a, b) => a.check_in.localeCompare(b.check_in))
  return kept
}
