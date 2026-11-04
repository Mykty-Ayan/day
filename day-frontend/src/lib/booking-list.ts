/** What one line of the booking list says of a stay: its dates and its money. */

import type { Booking } from '../types/booking'

const DAY_MS = 86_400_000

/** The stay's days and length, as the list shows them. Daily: "23 → 26 Nov · 3 nights",
 *  each end with its month when they differ. Hourly: one day and its hours. */
export function stayLine(
  booking: Pick<Booking, 'check_in' | 'check_out' | 'rental_mode'>,
  { day, dayMonth, nights }: { day: (iso: string) => string; dayMonth: (iso: string) => string; nights: (n: number) => string },
): { dates: string; detail: string } {
  const from = booking.check_in.slice(0, 10)
  const to = booking.check_out.slice(0, 10)
  const sameMonth = from.slice(0, 7) === to.slice(0, 7)
  if (booking.rental_mode === 'hourly') {
    const hours = `${booking.check_in.slice(11, 16)}–${booking.check_out.slice(11, 16)}`
    // Past midnight the stay ends on another day: both days are named, or 15:00–18:00
    // would read the same for three hours and for twenty-seven.
    if (from === to) return { dates: dayMonth(booking.check_in), detail: hours }
    return { dates: `${sameMonth ? day(booking.check_in) : dayMonth(booking.check_in)} → ${dayMonth(booking.check_out)}`, detail: hours }
  }
  const count = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS)
  return {
    dates: `${sameMonth ? day(booking.check_in) : dayMonth(booking.check_in)} → ${dayMonth(booking.check_out)}`,
    detail: nights(count),
  }
}

/** Owed on the stay itself, from the paid sum the list carries. A cancelled stay owes nothing. */
export function listOwes(booking: Pick<Booking, 'status' | 'total_price' | 'paid_amount'>): number {
  if (booking.status === 'cancelled') return 0
  return Math.max(0, Number(booking.total_price) - Number(booking.paid_amount ?? 0))
}
