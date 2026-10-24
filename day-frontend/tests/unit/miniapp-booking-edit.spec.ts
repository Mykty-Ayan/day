/**
 * The Mini App's booking edit sends only what changed: an untouched field must
 * not reach the server, or a save would reprice a stay nobody moved.
 */

import { expect, test } from '@playwright/test'
import { editPatch, formFromBooking } from '../../src/pages/miniapp/booking-edit'
import type { Booking } from '../../src/types/booking'

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b',
    check_in: '2026-10-25T14:00:00',
    check_out: '2026-10-27T12:00:00',
    rental_mode: 'daily',
    adults_count: 2,
    children_count: 0,
    total_price: 30000,
    calculated_price: 30000,
    notes: null,
    ...overrides,
  } as Booking
}

test('an untouched form sends nothing', () => {
  const b = booking()
  expect(editPatch(b, formFromBooking(b))).toEqual({ patch: {} })
})

test('new dates go out as days, both ends together', () => {
  const b = booking()
  expect(editPatch(b, { ...formFromBooking(b), checkOut: '2026-10-28' })).toEqual({
    patch: { check_in: '2026-10-25', check_out: '2026-10-28' },
  })
})

test('an hourly stay keeps its day and sends its times', () => {
  const b = booking({ rental_mode: 'hourly', check_in: '2026-10-25T15:00:00', check_out: '2026-10-25T18:00:00' })
  const form = formFromBooking(b)
  expect(form).toMatchObject({ day: '2026-10-25', start: '15:00', end: '18:00' })
  expect(editPatch(b, { ...form, end: '19:00' })).toEqual({
    patch: { check_in: '2026-10-25T15:00:00', check_out: '2026-10-25T19:00:00' },
  })
})

test('a check-out not after the check-in is refused', () => {
  const b = booking()
  expect(editPatch(b, { ...formFromBooking(b), checkOut: '2026-10-25' })).toEqual({ error: 'dates' })
})

test('a stay needs at least one adult', () => {
  const b = booking()
  expect(editPatch(b, { ...formFromBooking(b), adults: '0' })).toEqual({ error: 'adults' })
  expect(editPatch(b, { ...formFromBooking(b), children: '-1' })).toEqual({ error: 'adults' })
})

test('a price typed with spaces is read as a number, a negative one is refused', () => {
  const b = booking()
  expect(editPatch(b, { ...formFromBooking(b), price: '35 000' })).toEqual({ patch: { total_price: 35000 } })
  expect(editPatch(b, { ...formFromBooking(b), price: '-5' })).toEqual({ error: 'price' })
  expect(editPatch(b, { ...formFromBooking(b), price: '' })).toEqual({ error: 'price' })
})

test('guests and notes go out only when changed', () => {
  const b = booking({ notes: 'поздний заезд' })
  expect(editPatch(b, { ...formFromBooking(b), children: '1', notes: 'поздний заезд ' })).toEqual({
    patch: { children_count: 1 },
  })
})
