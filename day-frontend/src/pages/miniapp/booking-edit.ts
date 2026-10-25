/** The booking edit form in the Mini App: what it shows, and the patch it sends.
 *  Only what changed goes out, so a save never reprices a stay whose dates and
 *  party stayed the same. */

import type { Booking, BookingUpdateInput } from '../../types/booking'

export interface EditForm {
  /** Daily stays: yyyy-MM-dd. */
  checkIn: string
  checkOut: string
  /** Hourly stays: one day, two times. */
  day: string
  start: string
  end: string
  adults: string
  children: string
  price: string
  notes: string
}

export type EditError = 'dates' | 'adults' | 'price'

// Local wall-clock parts of the stored ISO string: the flat's time, as the card shows it.
const datePart = (value: string) => value.slice(0, 10)
const timePart = (value: string) => value.slice(11, 16)

export function formFromBooking(booking: Booking): EditForm {
  return {
    checkIn: datePart(booking.check_in),
    checkOut: datePart(booking.check_out),
    day: datePart(booking.check_in),
    start: timePart(booking.check_in),
    end: timePart(booking.check_out),
    adults: String(booking.adults_count),
    children: String(booking.children_count),
    price: String(booking.total_price),
    notes: booking.notes ?? '',
  }
}

function nextDay(day: string): string {
  const next = new Date(`${day}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

function count(value: string): number | null {
  return /^\d+$/.test(value.trim()) ? Number(value) : null
}

export function editPatch(booking: Booking, form: EditForm): { patch: BookingUpdateInput } | { error: EditError } {
  const hourly = booking.rental_mode === 'hourly'
  // An hourly stay may run past midnight (22:00–02:00): an end at or before the start is the next day.
  const endDay = hourly && form.end && form.start && form.end <= form.start ? nextDay(form.day) : form.day
  const checkIn = hourly ? `${form.day}T${form.start}:00` : form.checkIn
  const checkOut = hourly ? `${endDay}T${form.end}:00` : form.checkOut
  if (hourly ? !form.day || !form.start || !form.end || form.start === form.end : !checkIn || !checkOut || checkIn >= checkOut) {
    return { error: 'dates' }
  }
  const adults = count(form.adults)
  const children = count(form.children)
  if (adults === null || adults < 1 || children === null) return { error: 'adults' }
  const price = Number(form.price.replace(/\s/g, '').replace(',', '.'))
  if (form.price.trim() === '' || !Number.isFinite(price) || price < 0) return { error: 'price' }

  const patch: BookingUpdateInput = {}
  const same = (saved: string, sent: string) => (hourly ? saved.slice(0, 16) === sent.slice(0, 16) : datePart(saved) === sent)
  // Both ends go together: the server checks the new stay as a whole.
  if (!same(booking.check_in, checkIn) || !same(booking.check_out, checkOut)) {
    patch.check_in = checkIn
    patch.check_out = checkOut
  }
  if (adults !== booking.adults_count) patch.adults_count = adults
  if (children !== booking.children_count) patch.children_count = children
  if (price !== booking.total_price) patch.total_price = price
  if (form.notes.trim() !== (booking.notes ?? '').trim()) patch.notes = form.notes.trim()
  return { patch }
}
