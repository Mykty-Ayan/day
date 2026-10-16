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
 *  day is later, a new check-in otherwise. A picked stay is never stretched. */
export function pickStayDay(checkIn: string, checkOut: string, day: string): { checkIn: string; checkOut: string } {
  if (checkIn && !checkOut && day > checkIn) return { checkIn, checkOut: day }
  return { checkIn: day, checkOut: '' }
}

/** The days (yyyy-MM-dd) whose booked nights the calendar must know: the two
 *  months on screen from `month`, and back to the check-in while a check-out
 *  is being picked, since the stay covers every night from there.
 *  `to` is a day past the window: the filter compares a check-in time with midnight. */
export function nightsWindow(month: Date, checkIn: string | null): { from: string; to: string } {
  const shown = format(startOfMonth(month), 'yyyy-MM-dd')
  const from = checkIn && datePart(checkIn) < shown ? datePart(checkIn) : shown
  return { from, to: format(addDays(endOfMonth(addMonths(month, 1)), 1), 'yyyy-MM-dd') }
}
