/**
 * Editing a booking's dates: the server reprices a stay whose price it worked
 * out itself, and the form asks first. A paid 24 000 became 30 000 when the
 * check-out moved by an hour and a half, with no word to the operator.
 */

import { expect, test } from '@playwright/test'
import { wouldReprice } from '../../src/lib/booking-dates'

const booking = {
  check_in: '2026-10-18T14:00:00',
  check_out: '2026-10-18T22:00:00',
  rental_mode: 'hourly' as const,
  adults_count: 2,
  children_count: 0,
  total_price: 24000,
  calculated_price: 24000,
}
const same = { check_in: '2026-10-18T14:00:00', check_out: '2026-10-18T22:00:00', rental_mode: 'hourly' as const,
  adults_count: 2, children_count: 0 }

test('new hours of a stay priced by Day would change its price', () => {
  expect(wouldReprice(booking, { ...same, check_out: '2026-10-18T23:30:00' })).toBe(true)
  expect(wouldReprice(booking, { ...same, adults_count: 3 })).toBe(true)
  expect(wouldReprice(booking, same)).toBe(false)
})

test('a price set by hand stays, so there is nothing to ask', () => {
  expect(wouldReprice({ ...booking, total_price: 20000 }, { ...same, check_out: '2026-10-18T23:30:00' })).toBe(false)
})

test('a daily stay sent back as its dates is no change', () => {
  const daily = { ...booking, rental_mode: 'daily' as const, check_in: '2026-10-18T14:00:00', check_out: '2026-10-20T12:00:00' }
  expect(wouldReprice(daily, { ...same, rental_mode: 'daily', check_in: '2026-10-18', check_out: '2026-10-20' })).toBe(false)
  expect(wouldReprice(daily, { ...same, rental_mode: 'daily', check_in: '2026-10-18', check_out: '2026-10-21' })).toBe(true)
})
