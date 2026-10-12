/** Which nights or hours the Mini App sells: the date maths behind "Sell" and
 *  "Options for a guest", kept apart so it can be tested. */

import { addDays } from './format'

export type Period = 'tonight' | 'tomorrow' | 'weekend' | 'custom'

/** The weekend's nights are Friday's and Saturday's. On Saturday the one that is
 *  left; from Sunday on, the coming Friday to Sunday. */
export function weekendRange(today: Date): [Date, Date] {
  const weekday = today.getDay()
  if (weekday === 6) return [today, addDays(today, 1)]
  const friday = addDays(today, (5 - weekday + 7) % 7)
  return [friday, addDays(friday, 2)]
}

export function periodRange(period: Period, today: Date, custom: string, nights: number): [Date, Date] {
  if (period === 'tomorrow') return [addDays(today, 1), addDays(today, 2)]
  if (period === 'weekend') return weekendRange(today)
  if (period === 'custom' && custom) {
    const from = new Date(`${custom}T00:00:00`)
    if (!Number.isNaN(from.getTime())) return [from, addDays(from, Math.max(1, nights))]
  }
  return [today, addDays(today, 1)]
}

export function nightsBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const end = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((end - start) / 86_400_000)
}

/** A slot of whole hours from a start time; local wall-clock strings. */
export function hourlyRange(date: string, start: string, hours: number): { checkIn: string; checkOut: string } {
  const [year, month, dayOfMonth] = date.split('-').map(Number)
  const [hour, minute] = start.split(':').map(Number)
  const from = new Date(Date.UTC(year, month - 1, dayOfMonth, hour, minute))
  const to = new Date(from.getTime() + hours * 3_600_000)
  return { checkIn: from.toISOString().slice(0, 19), checkOut: to.toISOString().slice(0, 19) }
}

/** What the operator picked on "Sell", handed to the booking sheet. */
export interface SellRange {
  checkIn: string
  checkOut: string
  rentalMode: 'daily' | 'hourly'
  guests: number
}
