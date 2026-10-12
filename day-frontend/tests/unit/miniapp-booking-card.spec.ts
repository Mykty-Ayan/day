/**
 * The rules behind the Mini App booking card: who can be called, what can
 * still happen to a booking, how far "extend" goes, and what has been paid.
 * Each of these used to be a one-tap action with no check.
 */

import { expect, test } from '@playwright/test'
import { canCancel, extendedCheckOut, phoneDigits, settlement } from '../../src/pages/miniapp/booking-card'
import type { BookingPayment } from '../../src/types/booking'

test.describe('phoneDigits', () => {
  test('a Kazakh number written with 8 dials as +7', () => {
    expect(phoneDigits('8 (701) 111-22-33')).toBe('77011112233')
    expect(phoneDigits('+7 701 111 22 33')).toBe('77011112233')
    expect(phoneDigits('701 111 22 33')).toBe('77011112233')
  })

  test('anything else is passed through as digits, and nothing gives nothing', () => {
    expect(phoneDigits('+44 20 7946 0958')).toBe('442079460958')
    expect(phoneDigits(undefined)).toBe('')
    expect(phoneDigits('нет')).toBe('')
  })
})

test.describe('what can still happen', () => {
  test('only a booking that has not started can be cancelled', () => {
    expect(canCancel('pending')).toBe(true)
    expect(canCancel('confirmed')).toBe(true)
    expect(canCancel('checked_in')).toBe(false)
    expect(canCancel('cancelled')).toBe(false)
  })

  test('a stay extends by a night, an hourly booking by an hour, keeping the time of day', () => {
    expect(extendedCheckOut({ status: 'checked_in', rental_mode: 'daily', check_out: '2026-11-03T11:00:00' })).toBe(
      '2026-11-04T11:00:00',
    )
    expect(extendedCheckOut({ status: 'confirmed', rental_mode: 'hourly', check_out: '2026-11-03T16:00:00' })).toBe(
      '2026-11-03T17:00:00',
    )
  })

  test('a finished or cancelled booking cannot be extended', () => {
    for (const status of ['cancelled', 'checked_out', 'completed', 'pending'] as const) {
      expect(extendedCheckOut({ status, rental_mode: 'daily', check_out: '2026-11-03T12:00:00' })).toBeNull()
    }
  })
})

test.describe('settlement', () => {
  const payment = (amount: number, status: BookingPayment['status'], type: BookingPayment['type'] = 'payment') =>
    ({ id: `${amount}-${status}-${type}`, amount, status, type }) as BookingPayment

  test('only money that arrived counts; a refund gives it back; waiting payments are listed apart', () => {
    const result = settlement(40000, [
      payment(10000, 'completed'),
      payment(5000, 'pending'),
      payment(2000, 'completed', 'refund'),
      payment(3000, 'failed'),
    ])
    expect(result.paid).toBe(8000)
    expect(result.due).toBe(32000)
    expect(result.waiting.map((p) => p.amount)).toEqual([5000])
  })

  test('overpaid is never a negative debt', () => {
    expect(settlement(10000, [payment(12000, 'completed')]).due).toBe(0)
  })
})
