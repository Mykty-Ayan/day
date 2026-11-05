/** The flat's prices as the owner reads them, and as the server keeps them. */

import type { RentalMode } from '../types/booking'

/** What switching the way of letting does, said before it is done: the owner did not
 *  see Loft 5 turn daily-only and its hourly tariffs leave the chessboard. */
export function modeChangeKey(from: RentalMode, to: RentalMode): string | null {
  if (from === to) return null
  if (to === 'daily') return 'properties.pricing.modeToDaily'
  if (to === 'hourly') return 'properties.pricing.modeToHourly'
  return 'properties.pricing.modeToBoth'
}

/** The weekend night is typed as a price; the server keeps the markup over the base.
 *  Empty, or not above the base: no markup. */
export function weekendMarkup(base: number, weekendTyped: string): number {
  const weekend = Number.parseFloat(weekendTyped.replace(/\s+/g, '').replace(',', '.'))
  return Number.isFinite(weekend) && weekend > base ? weekend - base : 0
}

/** The weekend price after the weekday one moves from `from` to `to`: by the same
 *  amount, so the markup stays, even when it is none. */
export function shiftWeekend(from: number, to: number, weekendTyped: string): number {
  const weekend = Number.parseFloat(weekendTyped.replace(/\s+/g, '').replace(',', '.'))
  return (Number.isFinite(weekend) ? weekend : from) + (to - from)
}
