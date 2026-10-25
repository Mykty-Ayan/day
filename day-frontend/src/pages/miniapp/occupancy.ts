/** Two weeks of each flat, night by night: who sleeps there, what is closed,
 *  what is still free to sell. Read off the calendar feed the web chart uses. */

import type { Booking, GanttPropertyRow } from '../../types/booking'
import { addDays, toISODate } from './format'

export const OCCUPANCY_DAYS = 14

export type NightState = 'booked' | 'closed' | 'free'

export interface Night {
  date: string
  state: NightState
}

export interface FlatOccupancy {
  id: string
  name: string
  nights: Night[]
  free: number
  /** The stays touching the window, nearest first. */
  bookings: Booking[]
}

// The flat's wall-clock day, as the card shows it.
const day = (value: string) => value.slice(0, 10)

/** Whether a stay holds the night of `date`. A stay of a few hours inside one
 *  day holds that day: the flat cannot be sold for the night around it. */
function holds(booking: Booking, date: string): boolean {
  const from = day(booking.check_in)
  const to = day(booking.check_out)
  return from === to ? date === from : from <= date && date < to
}

export function flatOccupancy(row: GanttPropertyRow, start: Date, days = OCCUPANCY_DAYS): FlatOccupancy {
  const bookings = row.bookings
    .filter((booking) => booking.status !== 'cancelled')
    .sort((a, b) => a.check_in.localeCompare(b.check_in))
  const blocks = row.blocks ?? []
  const nights = Array.from({ length: days }, (_, index): Night => {
    const date = toISODate(addDays(start, index))
    if (bookings.some((booking) => holds(booking, date))) return { date, state: 'booked' }
    if (blocks.some((block) => block.start_date <= date && date < block.end_date)) return { date, state: 'closed' }
    return { date, state: 'free' }
  })
  return {
    id: row.id,
    name: row.name || row.internal_name,
    nights,
    free: nights.filter((night) => night.state === 'free').length,
    bookings,
  }
}

/** Every flat still in work; an archived one is not sold any more. */
export function occupancy(rows: GanttPropertyRow[], start: Date, days = OCCUPANCY_DAYS): FlatOccupancy[] {
  return rows.filter((row) => row.status !== 'archived').map((row) => flatOccupancy(row, start, days))
}
