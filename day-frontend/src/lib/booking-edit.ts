/** The "Dates" block of a booking's edit panel (flat, dates, times): what it shows, and the patch it sends. */

import type { Booking, BookingStatus, BookingUpdateInput, RentalMode } from '../types/booking'

/** One block of a booking, edited on its own. */
export type EditBlock = 'dates' | 'guests' | 'source' | 'notes'

/** What may still change. A cancelled stay keeps only its notes; a finished one also
 *  who brought the guest, since the agent's commission is paid on it afterwards. */
export function editableBlocks(status: BookingStatus): EditBlock[] {
  if (status === 'cancelled') return ['notes']
  if (status === 'completed') return ['source', 'notes']
  return ['dates', 'guests', 'source', 'notes']
}

export interface DatesForm {
  /** The flat: another one moves the stay there, together with any new dates. */
  property_id: string
  rental_mode: RentalMode
  /** Daily stays: yyyy-MM-dd and HH:mm for each end. */
  check_in: string
  check_out: string
  in_time: string
  out_time: string
  /** Hourly stays: one day, two times. */
  hourly_date: string
  start_time: string
  end_time: string
}

/** A field of the form and the i18n key of what is wrong with it. */
export type DatesError = Partial<Record<'check_in' | 'check_out' | 'in_time' | 'out_time' | 'start_time' | 'end_time', string>>

/** A daily stay's time as HH:MM. Not 00:00: the server reads a daily midnight as a bare
 *  date and puts the flat's hours instead (apply_default_times). */
export function isStayTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) && value !== '00:00'
}

// The stored ISO string's own wall clock: the flat's time, as the screen shows it.
const datePart = (value: string) => value.slice(0, 10)
const timePart = (value: string) => value.slice(11, 16)
const hour = (value: number) => `${String(value).padStart(2, '0')}:00`

/** The flat's hours, else the company's: a daily stay switched to from an hourly one starts with them. */
export interface FlatHours {
  check_in_hour?: number | null
  check_out_hour?: number | null
}

/** The times a daily stay in this flat starts with. */
export function flatHours(flat?: FlatHours): Pick<DatesForm, 'in_time' | 'out_time'> {
  return { in_time: hour(flat?.check_in_hour ?? 14), out_time: hour(flat?.check_out_hour ?? 12) }
}

export function datesForm(booking: Booking, flat?: FlatHours): DatesForm {
  const hourly = booking.rental_mode === 'hourly'
  return {
    property_id: booking.property_id,
    rental_mode: booking.rental_mode,
    check_in: datePart(booking.check_in),
    check_out: datePart(booking.check_out),
    in_time: hourly ? flatHours(flat).in_time : timePart(booking.check_in),
    out_time: hourly ? flatHours(flat).out_time : timePart(booking.check_out),
    hourly_date: hourly ? datePart(booking.check_in) : '',
    start_time: hourly ? timePart(booking.check_in) : '',
    end_time: hourly ? timePart(booking.check_out) : '',
  }
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function nextDay(day: string): string {
  const next = new Date(`${day}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

/** An hourly stay from its day and two times. An end at or before the start is the next
 *  day: a night (22:00 to 12:00) or hours past midnight need no second date. */
export function hourlyStay(day: string, start: string, end: string): { checkIn: string; checkOut: string } {
  return { checkIn: `${day}T${start}:00`, checkOut: `${end <= start ? nextDay(day) : day}T${end}:00` }
}

/** One way to end an hourly stay: a tariff's hours, or the night until the flat's hour. */
export type HourlyLength = { kind: 'hours'; hours: number } | { kind: 'night'; until: string }

/** The lengths offered: the flat's tariffs that are on (3 h, 6 h, the night); all three
 *  while its prices are not known. */
export function hourlyLengths(pricing?: { price_3h: number; price_6h: number; price_night: number; night_to: string }): HourlyLength[] {
  const lengths: HourlyLength[] = []
  if (!pricing || pricing.price_3h > 0) lengths.push({ kind: 'hours', hours: 3 })
  if (!pricing || pricing.price_6h > 0) lengths.push({ kind: 'hours', hours: 6 })
  if (!pricing || pricing.price_night > 0) lengths.push({ kind: 'night', until: (pricing?.night_to ?? '12:00').slice(0, 5) })
  return lengths
}

/** Where a length starting at `start` ends, as HH:MM. */
export function lengthEnd(start: string, length: HourlyLength): string {
  if (length.kind === 'night') return length.until
  const [h, m] = start.split(':').map(Number)
  return `${String((h + length.hours) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** The patch for the dates as the form has them; only what changed goes out.
 *  A daily stay goes with its times: what the operator sees is what is saved. */
export function datesPatch(booking: Booking, form: DatesForm): { patch: BookingUpdateInput } | { errors: DatesError } {
  const errors: DatesError = {}
  let checkIn: string
  let checkOut: string
  if (form.rental_mode === 'hourly') {
    if (!form.hourly_date) errors.check_in = 'bookings.validation.dateRequired'
    if (!TIME_RE.test(form.start_time)) errors.start_time = 'bookings.validation.startTimeRequired'
    if (!TIME_RE.test(form.end_time)) errors.end_time = 'bookings.validation.endTimeRequired'
    else if (form.start_time === form.end_time) errors.end_time = 'bookings.validation.endTimeAfterStart'
    ;({ checkIn, checkOut } = hourlyStay(form.hourly_date, form.start_time, form.end_time))
  } else {
    if (!form.check_in) errors.check_in = 'bookings.validation.checkInRequired'
    if (!form.check_out) errors.check_out = 'bookings.validation.checkOutRequired'
    else if (form.check_in && form.check_out <= form.check_in) errors.check_out = 'bookings.validation.checkOutAfterCheckIn'
    if (!isStayTime(form.in_time)) errors.in_time = 'bookings.validation.timeInvalid'
    if (!isStayTime(form.out_time)) errors.out_time = 'bookings.validation.timeInvalid'
    checkIn = `${form.check_in}T${form.in_time}:00`
    checkOut = `${form.check_out}T${form.out_time}:00`
  }
  if (Object.keys(errors).length > 0) return { errors }

  const patch: BookingUpdateInput = {}
  const same = (saved: string, sent: string) => saved.slice(0, 16) === sent.slice(0, 16)
  // Both ends and the mode go together: the server checks the new stay as a whole.
  if (form.rental_mode !== booking.rental_mode || !same(booking.check_in, checkIn) || !same(booking.check_out, checkOut)) {
    patch.check_in = checkIn
    patch.check_out = checkOut
    if (form.rental_mode !== booking.rental_mode) patch.rental_mode = form.rental_mode
  }
  if (form.property_id !== booking.property_id) patch.property_id = form.property_id
  return { patch }
}
