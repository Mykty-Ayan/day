/** A booking's money at a glance: what it costs, what came in, and which way the
 *  rest goes. A cancelled stay owes nothing: whatever came in is to give back. */

import { settlement } from '../pages/miniapp/booking-card'
import type { BookingPayment, BookingStatus, PriceCalculation } from '../types/booking'

export function bookingMoney(status: BookingStatus, total: number, payments: BookingPayment[]) {
  const { paid } = settlement(total, payments)
  const owes = status === 'cancelled' ? 0 : Math.max(0, total - paid)
  const toReturn = status === 'cancelled' ? Math.max(0, paid) : Math.max(0, paid - total)
  return { total: status === 'cancelled' ? 0 : total, paid, owes, toReturn }
}

/** The sums offered for a payment: all that is left, half of it, the first night
 *  of a stay by the night. Never the booking's full price: it may be paid already. */
export function paymentSuggestions(owes: number, firstNight: number | null) {
  return { all: owes, half: owes / 2, firstNight: firstNight !== null && firstNight < owes ? firstNight : null }
}

export type PriceLine = { kind: 'weekend' | 'season' | 'guests' | 'discount'; amount: number }

/** What was added to the base price, for a price worked out again today. The sum
 *  is not kept at booking time, so a different total means the flat's prices have
 *  changed since then, and null says this reckoning explains nothing. */
export function priceLines(calculation: PriceCalculation, bookedPrice: number): PriceLine[] | null {
  if (Math.abs(Number(calculation.total) - bookedPrice) >= 1) return null
  const lines: PriceLine[] = [
    { kind: 'weekend', amount: Number(calculation.weekend_surcharge) },
    { kind: 'season', amount: Number(calculation.seasonal_adjustment) },
    { kind: 'guests', amount: Number(calculation.extra_guest_surcharge) },
    { kind: 'discount', amount: -Number(calculation.discount_amount) },
  ]
  return lines.filter((line) => line.amount !== 0)
}
