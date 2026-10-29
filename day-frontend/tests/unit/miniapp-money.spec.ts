/**
 * The money tab's arithmetic: a month is its first to last day, a guest owes
 * what is left to pay, and a cancelled stay counts for neither debts nor payments.
 */

import { expect, test } from '@playwright/test'
import { debts, metricsRange, periodRange, received } from '../../src/pages/miniapp/money'
import { tabFromSearch } from '../../src/pages/miniapp/tabs'
import type { Booking } from '../../src/types/booking'

function stay(id: string, total: number, paid: number, overrides: Partial<Booking> = {}): Booking {
  return { id, total_price: total, paid_amount: paid, status: 'confirmed', check_in: '2026-10-10T14:00:00', ...overrides } as Booking
}

test('this month and last month run from the first to the last day', () => {
  const today = new Date(2026, 0, 15)
  expect(periodRange('month', today)).toEqual({ date_from: '2026-01-01', date_to: '2026-01-31' })
  expect(periodRange('lastMonth', today)).toEqual({ date_from: '2025-12-01', date_to: '2025-12-31' })
  expect(periodRange('month', new Date(2028, 1, 29))).toEqual({ date_from: '2028-02-01', date_to: '2028-02-29' })
})

test('debts are what is left to pay, nearest arrival first', () => {
  const result = debts([
    stay('later', 30000, 10000, { check_in: '2026-10-20T14:00:00' }),
    stay('paid', 20000, 20000),
    stay('sooner', 15000, 0, { check_in: '2026-10-05T14:00:00' }),
    stay('overpaid', 10000, 12000),
  ])
  expect(result.items.map((booking) => booking.id)).toEqual(['sooner', 'later'])
  expect(result.total).toBe(35000)
})

test('payments add up what guests paid, a cancelled stay counts for nothing', () => {
  const result = received([
    stay('small', 30000, 5000),
    stay('none', 30000, 0),
    stay('big', 30000, 30000),
    stay('gone', 30000, 30000, { status: 'cancelled' }),
  ])
  expect(result.items.map((booking) => booking.id)).toEqual(['big', 'small'])
  expect(result.total).toBe(35000)
  expect(debts([stay('gone', 30000, 0, { status: 'cancelled' })]).total).toBe(0)
})

test('the money tab and the ask screen open from a link', () => {
  expect(tabFromSearch('?tab=money')).toBe('money')
  expect(tabFromSearch('?tab=ask')).toBe('ask')
})

test('analytics gets the day after the month, so the last day counts', () => {
  expect(metricsRange('month', new Date(2026, 9, 30))).toEqual({ date_from: '2026-10-01', date_to: '2026-11-01' })
  expect(metricsRange('lastMonth', new Date(2026, 0, 15))).toEqual({ date_from: '2025-12-01', date_to: '2026-01-01' })
})
