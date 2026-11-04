/**
 * The "Dates" block of a booking: a daily stay now shows and saves its times.
 * The old form had no time fields, so a guest arriving at 16:00 could not be
 * written down.
 */

import { expect, test } from '@playwright/test'
import { datesForm, datesPatch } from '../../src/lib/booking-edit'
import type { Booking } from '../../src/types/booking'

const daily = {
  check_in: '2026-11-16T14:00:00',
  check_out: '2026-11-19T12:00:00',
  rental_mode: 'daily',
} as Booking
const hourly = {
  check_in: '2026-11-16T10:00:00',
  check_out: '2026-11-16T13:00:00',
  rental_mode: 'hourly',
} as Booking

test('a daily stay opens with its own dates and times', () => {
  const form = datesForm({ ...daily, check_in: '2026-11-16T16:30:00' })
  expect(form).toMatchObject({ check_in: '2026-11-16', in_time: '16:30', check_out: '2026-11-19', out_time: '12:00' })
})

test('nothing changed sends nothing', () => {
  expect(datesPatch(daily, datesForm(daily))).toEqual({ patch: {} })
})

test('a new arrival time goes out with both ends', () => {
  const form = { ...datesForm(daily), in_time: '16:00' }
  expect(datesPatch(daily, form)).toEqual({
    patch: { check_in: '2026-11-16T16:00:00', check_out: '2026-11-19T12:00:00' },
  })
})

test('new dates keep the times the form shows', () => {
  const form = { ...datesForm(daily), check_out: '2026-11-20', out_time: '10:00' }
  expect(datesPatch(daily, form)).toEqual({
    patch: { check_in: '2026-11-16T14:00:00', check_out: '2026-11-20T10:00:00' },
  })
})

test('a check-out not after the check-in is refused', () => {
  const form = { ...datesForm(daily), check_out: '2026-11-16' }
  expect(datesPatch(daily, form)).toEqual({ errors: { check_out: 'bookings.validation.checkOutAfterCheckIn' } })
})

test('an hourly stay switched to daily starts with the flat hours', () => {
  const form = datesForm(hourly, { check_in_hour: 15, check_out_hour: 11 })
  expect(form).toMatchObject({ hourly_date: '2026-11-16', start_time: '10:00', end_time: '13:00', in_time: '15:00', out_time: '11:00' })
  const patch = datesPatch(hourly, { ...form, rental_mode: 'daily', check_in: '2026-11-16', check_out: '2026-11-17' })
  expect(patch).toEqual({
    patch: { check_in: '2026-11-16T15:00:00', check_out: '2026-11-17T11:00:00', rental_mode: 'daily' },
  })
})

test('hourly hours must end after they start', () => {
  const form = { ...datesForm(hourly), end_time: '09:00' }
  expect(datesPatch(hourly, form)).toEqual({ errors: { end_time: 'bookings.validation.endTimeAfterStart' } })
})
