/**
 * The "Dates" block of a booking: a daily stay now shows and saves its times.
 * The old form had no time fields, so a guest arriving at 16:00 could not be
 * written down.
 */

import { expect, test } from '@playwright/test'
import { datesForm, datesPatch, editableBlocks, flatHours, hourlyLengths, hourlyStay, isStayTime, lengthEnd, settleEnd } from '../../src/lib/booking-edit'
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

test('hourly hours cannot end when they start; an earlier end is the next morning', () => {
  expect(datesPatch(hourly, { ...datesForm(hourly), end_time: '10:00' })).toEqual({
    errors: { end_time: 'bookings.validation.endTimeAfterStart' },
  })
  expect(datesPatch(hourly, { ...datesForm(hourly), end_time: '09:00' })).toEqual({
    patch: { check_in: '2026-11-16T10:00:00', check_out: '2026-11-17T09:00:00' },
  })
})

test('a finished stay keeps who brought the guest open: the commission follows it', () => {
  expect(editableBlocks('completed')).toEqual(['source', 'notes'])
  expect(editableBlocks('cancelled')).toEqual(['notes'])
  expect(editableBlocks('confirmed')).toEqual(['dates', 'guests', 'source', 'notes'])
})

test('the flat hours are read when known, else 14:00 and 12:00', () => {
  expect(flatHours({ check_in_hour: 15, check_out_hour: 11 })).toEqual({ in_time: '15:00', out_time: '11:00' })
  expect(flatHours(undefined)).toEqual({ in_time: '14:00', out_time: '12:00' })
})

test('another flat goes out alone when the dates stay', () => {
  const booking = { ...daily, property_id: 'flat-a' } as Booking
  const form = { ...datesForm(booking), property_id: 'flat-b' }
  expect(datesPatch(booking, form)).toEqual({ patch: { property_id: 'flat-b' } })
})

test('another flat and new dates go out in one patch', () => {
  const booking = { ...daily, property_id: 'flat-a' } as Booking
  const form = { ...datesForm(booking), property_id: 'flat-b', check_out: '2026-11-20' }
  expect(datesPatch(booking, form)).toEqual({
    patch: { check_in: '2026-11-16T14:00:00', check_out: '2026-11-20T12:00:00', property_id: 'flat-b' },
  })
})

test('a wrong typed time is refused, not replaced by the one picked before', () => {
  // Typed 1630, then 0000: the form must not quietly save 16:30.
  expect(datesPatch(daily, { ...datesForm(daily), in_time: '00:00' })).toEqual({
    errors: { in_time: 'bookings.validation.timeInvalid' },
  })
  expect(datesPatch(daily, { ...datesForm(daily), out_time: '25:1' })).toEqual({
    errors: { out_time: 'bookings.validation.timeInvalid' },
  })
  expect(isStayTime('16:30')).toBe(true)
  expect(isStayTime('')).toBe(false)
})

test('an hourly end at or before the start is the next day', () => {
  expect(hourlyStay('2026-11-14', '15:00', '18:00')).toEqual({ checkIn: '2026-11-14T15:00:00', checkOut: '2026-11-14T18:00:00' })
  expect(hourlyStay('2026-11-14', '22:00', '12:00')).toEqual({ checkIn: '2026-11-14T22:00:00', checkOut: '2026-11-15T12:00:00' })
  expect(hourlyStay('2026-11-30', '23:00', '02:00').checkOut).toBe('2026-12-01T02:00:00')
})

test('the lengths offered follow the flat tariffs that are on', () => {
  const pricing = { price_3h: 8000, price_6h: 0, price_night: 15000, night_to: '12:00:00' }
  expect(hourlyLengths(pricing)).toEqual([{ kind: 'hours', hours: 3 }, { kind: 'night', until: '12:00' }])
  expect(hourlyLengths(undefined)).toHaveLength(3)
  expect(lengthEnd('21:30', { kind: 'hours', hours: 3 })).toBe('00:30')
  expect(lengthEnd('22:00', { kind: 'night', until: '12:00' })).toBe('12:00')
})

test('an hourly stay saved across midnight keeps its next-day end', () => {
  const night = { check_in: '2026-11-14T22:00:00', check_out: '2026-11-15T12:00:00', rental_mode: 'hourly' } as Booking
  expect(datesPatch(night, datesForm(night))).toEqual({ patch: {} })
})

test('a night with its day cleared is refused, not broken', () => {
  const night = { check_in: '2026-11-14T22:00:00', check_out: '2026-11-15T12:00:00', rental_mode: 'hourly' } as Booking
  expect(datesPatch(night, { ...datesForm(night), hourly_date: '' })).toEqual({
    errors: { check_in: 'bookings.validation.dateRequired' },
  })
})

test('a picked length moves the end with a whole new start; a typed end stays', () => {
  const lengths = hourlyLengths({ price_3h: 8000, price_6h: 12000, price_night: 15000, night_to: '12:00:00' })
  // 09:00 till 12:00 typed by hand, then the start moves: the end stays 12:00.
  expect(settleEnd({ by: 'time' }, lengths, '10:00', '12:00').end).toBe('12:00')
  // 15:00 + 3 h, the start typed as 1630: no move while it is "16", then 19:30.
  expect(settleEnd({ by: 'length', key: '3h' }, lengths, '16', '18:00').end).toBe('18:00')
  expect(settleEnd({ by: 'length', key: '3h' }, lengths, '16:30', '18:00').end).toBe('19:30')
})

test('the night follows the hour of the flat picked; a length it does not sell becomes a typed end', () => {
  const flatB = hourlyLengths({ price_3h: 0, price_6h: 0, price_night: 15000, night_to: '10:00:00' })
  expect(settleEnd({ by: 'length', key: 'night' }, flatB, '22:00', '12:00')).toEqual({ by: { by: 'length', key: 'night' }, end: '10:00' })
  expect(settleEnd({ by: 'length', key: '3h' }, flatB, '15:00', '18:00')).toEqual({ by: { by: 'time' }, end: '18:00' })
})

test('an hourly stay longer than a day keeps its end on a move', () => {
  const long = { check_in: '2026-11-14T22:00:00', check_out: '2026-11-16T12:00:00', rental_mode: 'hourly', property_id: 'a' } as Booking
  expect(datesPatch(long, { ...datesForm(long), property_id: 'b' })).toEqual({ patch: { property_id: 'b' } })
})
