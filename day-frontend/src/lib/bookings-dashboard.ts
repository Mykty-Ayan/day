/** The figures of the bookings dashboard, counted from the stays themselves. A month is yyyy-MM,
 *  a day yyyy-MM-dd in the company's time. A stay belongs to the month it arrives in;
 *  occupancy counts the nights inside the month, whenever the stay began. */

import { addDays, addMonths, format, parseISO } from 'date-fns'
import type { Booking, BookingSource } from '../types/booking'
import { listOwes } from './booking-list'

type Stay = Pick<
  Booking,
  'id' | 'property_id' | 'status' | 'source' | 'total_price' | 'paid_amount' | 'check_in' | 'check_out' | 'rental_mode' | 'created_at'
>

const day = (iso: string) => iso.slice(0, 10)
const live = (stay: Stay) => stay.status !== 'cancelled'
const shiftDay = (d: string, by: number) => format(addDays(parseISO(d), by), 'yyyy-MM-dd')

/** The moment the server wrote: in UTC, without saying so. */
export const serverMoment = (iso: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`)

export const shiftMonth = (month: string, by: number) => format(addMonths(parseISO(`${month}-01`), by), 'yyyy-MM')

export function monthDays(month: string): string[] {
  const days: string[] = []
  for (let d = parseISO(`${month}-01`); format(d, 'yyyy-MM') === month; d = addDays(d, 1)) days.push(format(d, 'yyyy-MM-dd'))
  return days
}

/** The stays the month and the month before need: every stay with a night or an arrival in either. */
export function stayWindow(month: string): { date_from: string; date_to: string } {
  const days = monthDays(month)
  return { date_from: `${shiftMonth(month, -1)}-01`, date_to: days[days.length - 1] }
}

/** The bookings made in the month, asked by the server's UTC days: a day wider on each side, as the
 *  company's day can begin or end on the UTC day next to it. `madeByDay` keeps the month's own. */
export function madeWindow(month: string): { created_from: string; created_to: string } {
  const days = monthDays(month)
  return { created_from: shiftDay(days[0], -1), created_to: shiftDay(days[days.length - 1], 1) }
}

/** The nights a stay sleeps over, by the day each begins. An hourly stay sleeps none. */
export function nightsOf(stay: Pick<Stay, 'check_in' | 'check_out' | 'rental_mode'>): string[] {
  if (stay.rental_mode === 'hourly') return []
  const nights: string[] = []
  for (let d = parseISO(day(stay.check_in)); format(d, 'yyyy-MM-dd') < day(stay.check_out); d = addDays(d, 1)) {
    nights.push(format(d, 'yyyy-MM-dd'))
  }
  return nights
}

export interface MonthFigures {
  bookings: number
  booked: number
  received: number
  owes: number
  /** Nights taken in the month over the nights the objects had, 0–1. */
  occupancy: number
  /** What a night of the month's daily stays came to on average. */
  nightPrice: number
  cancelled: number
}

export function monthFigures(stays: Stay[], month: string, objectIds: string[]): MonthFigures {
  const arriving = stays.filter((s) => day(s.check_in).slice(0, 7) === month)
  const kept = arriving.filter(live)
  let booked = 0
  let received = 0
  let owes = 0
  let dailyMoney = 0
  let dailyNights = 0
  for (const stay of kept) {
    booked += Number(stay.total_price)
    received += Number(stay.paid_amount ?? 0)
    owes += listOwes(stay)
    const nights = nightsOf(stay).length
    if (nights > 0) {
      dailyMoney += Number(stay.total_price)
      dailyNights += nights
    }
  }
  const days = monthDays(month).length
  const taken = occupancyByDay(stays, month, objectIds).reduce((sum, d) => sum + d.taken, 0)
  return {
    bookings: kept.length,
    booked,
    received,
    owes,
    occupancy: objectIds.length > 0 ? taken / (objectIds.length * days) : 0,
    nightPrice: dailyNights > 0 ? dailyMoney / dailyNights : 0,
    cancelled: arriving.length - kept.length,
  }
}

/** How many of the objects are taken on each night of the month. */
export function occupancyByDay(stays: Stay[], month: string, objectIds: string[]): { day: string; taken: number }[] {
  const objects = new Set(objectIds)
  const taken = new Map<string, Set<string>>()
  for (const stay of stays) {
    if (!live(stay) || !objects.has(stay.property_id)) continue
    for (const night of nightsOf(stay)) {
      if (night.slice(0, 7) !== month) continue
      taken.set(night, (taken.get(night) ?? new Set()).add(stay.property_id))
    }
  }
  return monthDays(month).map((d) => ({ day: d, taken: taken.get(d)?.size ?? 0 }))
}

/** The bookings made on each day of the month, cancelled ones too: they were sold all the same.
 *  `madeOn` turns the server's moment into the company's day. */
export function madeByDay(stays: Stay[], month: string, madeOn: (createdAt: string) => string) {
  const made = new Map<string, { count: number; sum: number }>()
  for (const stay of stays) {
    const d = madeOn(stay.created_at)
    if (d.slice(0, 7) !== month) continue
    const was = made.get(d) ?? { count: 0, sum: 0 }
    made.set(d, { count: was.count + 1, sum: was.sum + Number(stay.total_price) })
  }
  return monthDays(month).map((d) => ({ day: d, ...(made.get(d) ?? { count: 0, sum: 0 }) }))
}

/** Where the month's bookings came from, the most first. */
export function bySource(stays: Stay[], month: string): { source: BookingSource; count: number; sum: number }[] {
  const sources = new Map<BookingSource, { count: number; sum: number }>()
  for (const stay of stays) {
    if (!live(stay) || day(stay.check_in).slice(0, 7) !== month) continue
    const was = sources.get(stay.source) ?? { count: 0, sum: 0 }
    sources.set(stay.source, { count: was.count + 1, sum: was.sum + Number(stay.total_price) })
  }
  return [...sources.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.count - a.count || b.sum - a.sum)
}

/** The objects a month touched: a night taken in it or a stay arriving in it. */
export function touched(stays: Stay[], month: string): Set<string> {
  const ids = new Set<string>()
  for (const stay of stays) {
    if (!live(stay)) continue
    if (day(stay.check_in).slice(0, 7) === month || nightsOf(stay).some((n) => n.slice(0, 7) === month)) ids.add(stay.property_id)
  }
  return ids
}

/** Each object's month: the share of its nights taken and what its arriving stays come to, the busiest first. */
export function byObject(stays: Stay[], month: string, objectIds: string[]) {
  const days = monthDays(month).length
  return objectIds
    .map((id) => {
      const own = stays.filter((s) => s.property_id === id)
      const nights = occupancyByDay(own, month, [id]).reduce((sum, d) => sum + d.taken, 0)
      const sum = own.filter((s) => live(s) && day(s.check_in).slice(0, 7) === month).reduce((t, s) => t + Number(s.total_price), 0)
      return { id, nights, occupancy: nights / days, sum }
    })
    .sort((a, b) => b.occupancy - a.occupancy || b.sum - a.sum)
}

/** What waits on someone now, whatever month is looked at. A guest kept past the check-out is
 *  still in the flat, and still owes. */
export function waiting<T extends Stay>(stays: T[], today: string, ahead = 7) {
  const until = shiftDay(today, ahead)
  const notOver = (s: T) => day(s.check_out) >= today || s.status === 'checked_in'
  return {
    unconfirmed: stays.filter((s) => s.status === 'pending' && notOver(s)).sort((a, b) => a.check_in.localeCompare(b.check_in)),
    owing: stays
      .filter((s) => live(s) && notOver(s) && listOwes(s) > 0)
      .sort((a, b) => listOwes(b) - listOwes(a)),
    arriving: stays
      .filter((s) => (s.status === 'pending' || s.status === 'confirmed') && day(s.check_in) >= today && day(s.check_in) < until)
      .sort((a, b) => a.check_in.localeCompare(b.check_in)),
  }
}
