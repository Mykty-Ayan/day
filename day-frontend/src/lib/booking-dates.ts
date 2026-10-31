import { addDays, addMonths, endOfMonth, format, parseISO, startOfMonth } from 'date-fns'
import type { Booking, BookingStatus, RentalMode } from '../types/booking'

interface BookingDates {
  check_in: string
  check_out: string
  rental_mode: RentalMode
  hourly_date: string
}

// A saved booking holds date and time ("2026-10-20T14:00:00"); a picked one only the date.
const datePart = (value: string) => value.slice(0, 10)

/** Switch a booking form between daily and hourly, carrying the picked date
 *  over: the check-in date becomes the hourly date and back. A check-out that
 *  no longer falls on a later day than the carried check-in is dropped. */
export function switchRentalMode<T extends BookingDates>(form: T, mode: RentalMode): T {
  if (mode === 'hourly') {
    return { ...form, rental_mode: mode, hourly_date: datePart(form.check_in) || form.hourly_date }
  }
  const checkIn = form.hourly_date || datePart(form.check_in)
  const checkOut = datePart(form.check_out) > checkIn ? form.check_out : ''
  return { ...form, rental_mode: mode, check_in: checkIn, check_out: checkOut }
}

/** What the calendar needs of a booking to tell its nights. */
export type Stay = Pick<Booking, 'id' | 'check_in' | 'check_out' | 'status' | 'rental_mode'>

// The database lets no two bookings in these statuses overlap (bookings_no_overlap).
const FREES_NIGHTS: BookingStatus[] = ['cancelled', 'completed']

/** The nights (yyyy-MM-dd) a flat's daily stays take: check-in day to the night
 *  before check-out. An hourly booking takes no night: the server checks its
 *  hours against a new stay. `exceptId` is the booking being edited. */
export function bookedNights(stays: Stay[], exceptId?: string): Set<string> {
  const nights = new Set<string>()
  for (const stay of stays) {
    if (stay.id === exceptId || stay.rental_mode === 'hourly' || FREES_NIGHTS.includes(stay.status)) continue
    const checkOut = datePart(stay.check_out)
    for (let night = parseISO(datePart(stay.check_in)); format(night, 'yyyy-MM-dd') < checkOut; night = addDays(night, 1)) {
      nights.add(format(night, 'yyyy-MM-dd'))
    }
  }
  return nights
}

/** The nights (yyyy-MM-dd) a flat is closed: start_date to the night before end_date. */
export function blockNights(blocks: { start_date: string; end_date: string }[]): Set<string> {
  const nights = new Set<string>()
  for (const block of blocks) {
    for (let night = parseISO(block.start_date); format(night, 'yyyy-MM-dd') < block.end_date; night = addDays(night, 1)) {
      nights.add(format(night, 'yyyy-MM-dd'))
    }
  }
  return nights
}

/** Whether a day cannot be clicked in the daily range picker. With no check-in
 *  picked, a click starts a stay, and a booked night cannot. After a check-in, a
 *  later click is the check-out: up to and including the first booked night
 *  (that guest leaves the day the next one arrives), never past it. */
export function isDayBlocked(day: string, booked: ReadonlySet<string>, checkIn: string | null): boolean {
  if (!checkIn || day <= checkIn) return booked.has(day)
  const firstBooked = [...booked].filter((night) => night >= checkIn).sort()[0]
  return firstBooked !== undefined && day > firstBooked
}

/** The stay after a click: the check-out when a check-in waits for one and the
 *  day is later, a new check-in otherwise. A picked stay is never stretched.
 *  `sameDay` lets one day be both ends (a report, not a stay). */
export function pickStayDay(
  checkIn: string,
  checkOut: string,
  day: string,
  { sameDay = false }: { sameDay?: boolean } = {},
): { checkIn: string; checkOut: string } {
  if (checkIn && !checkOut && (day > checkIn || (sameDay && day === checkIn))) return { checkIn, checkOut: day }
  return { checkIn: day, checkOut: '' }
}

/** The days (yyyy-MM-dd) whose booked nights the calendar must know: the two
 *  months on screen from `month`, and back to the check-in while a check-out
 *  is being picked, since the stay covers every night from there.
 *  `to` is a day past the window: closed days end before it, bookings take it as one more day. */
export function nightsWindow(month: Date, checkIn: string | null): { from: string; to: string } {
  const shown = format(startOfMonth(month), 'yyyy-MM-dd')
  const from = checkIn && datePart(checkIn) < shown ? datePart(checkIn) : shown
  return { from, to: format(addDays(endOfMonth(addMonths(month, 1)), 1), 'yyyy-MM-dd') }
}

/** The booking as saved, and what the edit form is about to send. */
interface PricedStay {
  check_in: string
  check_out: string
  rental_mode: RentalMode
  adults_count: number
  children_count: number
  total_price: number
  calculated_price: number
}
interface StayEdit {
  check_in?: string
  check_out?: string
  rental_mode?: RentalMode
  adults_count?: number
  children_count?: number
}

/** A sent date or time is new only if it differs from the saved one; a daily
 *  stay comes back as its dates, which match the saved check-in day. */
function moved(saved: string, sent: string | undefined): boolean {
  if (sent === undefined) return false
  return sent.length <= 10 ? saved.slice(0, 10) !== sent : saved.slice(0, 16) !== sent.slice(0, 16)
}

/** Whether saving would let the server reprice the stay: it does so for a price
 *  it worked out itself (total equal to the calculated one) when the dates, the
 *  mode or the party change. A price set by hand stays as it is. */
export function wouldReprice(booking: PricedStay, edit: StayEdit): boolean {
  if (booking.total_price !== booking.calculated_price) return false
  return (
    moved(booking.check_in, edit.check_in) ||
    moved(booking.check_out, edit.check_out) ||
    (edit.rental_mode !== undefined && edit.rental_mode !== booking.rental_mode) ||
    (edit.adults_count !== undefined && edit.adults_count !== booking.adults_count) ||
    (edit.children_count !== undefined && edit.children_count !== booking.children_count)
  )
}
