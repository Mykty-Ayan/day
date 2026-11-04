/**
 * One line of the booking list. The old list showed an hourly stay as
 * "14 Nov → 14 Nov" and no debt at all.
 */

import { expect, test } from '@playwright/test'
import { listOwes, stayLine } from '../../src/lib/booking-list'

const fmt = {
  day: (iso: string) => String(Number(iso.slice(8, 10))),
  dayMonth: (iso: string) => `${Number(iso.slice(8, 10))} ${iso.slice(5, 7)}`,
  nights: (n: number) => `${n} n`,
}

test('a daily stay in one month names the month once', () => {
  expect(stayLine({ check_in: '2026-11-23T14:00:00', check_out: '2026-11-26T12:00:00', rental_mode: 'daily' }, fmt)).toEqual({
    dates: '23 → 26 11',
    detail: '3 n',
  })
})

test('a stay across months names both', () => {
  expect(stayLine({ check_in: '2026-11-30T14:00:00', check_out: '2026-12-02T12:00:00', rental_mode: 'daily' }, fmt)).toEqual({
    dates: '30 11 → 2 12',
    detail: '2 n',
  })
})

test('an hourly stay shows its day and hours', () => {
  expect(stayLine({ check_in: '2026-11-14T15:00:00', check_out: '2026-11-14T18:00:00', rental_mode: 'hourly' }, fmt)).toEqual({
    dates: '14 11',
    detail: '15:00–18:00',
  })
})

test('the debt is what is left of the price; a cancelled stay owes nothing', () => {
  expect(listOwes({ status: 'confirmed', total_price: 75000, paid_amount: 1000 })).toBe(74000)
  expect(listOwes({ status: 'confirmed', total_price: 75000, paid_amount: 80000 })).toBe(0)
  expect(listOwes({ status: 'cancelled', total_price: 75000, paid_amount: 0 })).toBe(0)
})
