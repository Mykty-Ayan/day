import type { RentalMode } from '../types/booking'

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
