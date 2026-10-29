/** The money tab's arithmetic: which days a period covers, what guests still
 *  owe and what they have paid on the stays in it. Income, expenses and profit
 *  come from the server's analytics, as the web shows them. */

import type { Booking } from '../../types/booking'
import { toISODate } from './format'

export type MoneyPeriod = 'month' | 'lastMonth'

/** The first and the last day of this month or the one before. */
export function periodRange(period: MoneyPeriod, today: Date): { date_from: string; date_to: string } {
  const shift = period === 'month' ? 0 : -1
  const first = new Date(today.getFullYear(), today.getMonth() + shift, 1)
  const last = new Date(today.getFullYear(), today.getMonth() + shift + 1, 0)
  return { date_from: toISODate(first), date_to: toISODate(last) }
}

/** The stay's debt and the minibar orders on the guest's tab. */
export const owed = (booking: Booking) =>
  Math.max(0, booking.total_price - (booking.paid_amount ?? 0)) + (booking.orders_due ?? 0)

/** A row's debt: all of it, and the minibar orders' part; null when nothing is owed. */
export function rowDebt(booking: Booking): { total: number; orders: number } | null {
  if (booking.status === 'cancelled') return null
  const total = owed(booking)
  return total > 0 ? { total, orders: booking.orders_due ?? 0 } : null
}

const live = (bookings: Booking[]) => bookings.filter((booking) => booking.status !== 'cancelled')
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

/** Stays with money still to take, the nearest arrival first. */
export function debts(bookings: Booking[]): { items: Booking[]; total: number } {
  const items = live(bookings)
    .filter((booking) => owed(booking) > 0)
    .sort((a, b) => a.check_in.localeCompare(b.check_in))
  return { items, total: sum(items.map(owed)) }
}

/** Stays a guest has paid something for, the largest payment first. */
export function received(bookings: Booking[]): { items: Booking[]; total: number } {
  const items = live(bookings)
    .filter((booking) => (booking.paid_amount ?? 0) > 0)
    .sort((a, b) => (b.paid_amount ?? 0) - (a.paid_amount ?? 0))
  return { items, total: sum(items.map((booking) => booking.paid_amount ?? 0)) }
}
