/**
 * The rules behind the Mini App booking card: who can be called, what can
 * still happen to a booking, how far "extend" goes, and what has been paid.
 * Each of these used to be a one-tap action with no check.
 */

import { expect, test } from '@playwright/test'
import {
  canCancel,
  extendedCheckOut,
  loadAttempt,
  paymentMaybeRecorded,
  phoneDigits,
  saveAttempt,
  settlement,
  type MoneyAttempt,
} from '../../src/pages/miniapp/booking-card'
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

test.describe('a payment call that failed', () => {
  test('with no answer the money may be recorded: retry the same attempt', () => {
    expect(paymentMaybeRecorded(new Error('timeout of 20000ms exceeded'))).toBe(true)
  })

  test('a refusal from the server means nothing was recorded', () => {
    expect(paymentMaybeRecorded({ response: { status: 422, data: { detail: [] } } })).toBe(false)
    expect(paymentMaybeRecorded({ response: { status: 409 } })).toBe(false)
  })

  test('a gateway error or a proxy timeout may come after the payment was saved', () => {
    expect(paymentMaybeRecorded({ response: { status: 502 } })).toBe(true)
    expect(paymentMaybeRecorded({ response: { status: 504 } })).toBe(true)
    expect(paymentMaybeRecorded({ response: { status: 408 } })).toBe(true)
  })
})

test.describe('an unsettled money attempt outlives the card', () => {
  function memory() {
    const data = new Map<string, string>()
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    }
  }

  test('saved before sending, found again when the card reopens, gone once settled', () => {
    const storage = memory()
    const attempt: MoneyAttempt = { kind: 'payment', amount: 20000, method: 'cash', key: 'k-1' }

    saveAttempt(storage, 'b-1', attempt)
    expect(loadAttempt(storage, 'b-1')).toEqual(attempt)
    expect(loadAttempt(storage, 'b-2')).toBeNull()

    saveAttempt(storage, 'b-1', null)
    expect(loadAttempt(storage, 'b-1')).toBeNull()
  })

  test('broken or blocked storage never breaks the card', () => {
    const broken = {
      getItem: () => '{not json',
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadAttempt(broken, 'b-1')).toBeNull()
    expect(() => saveAttempt(broken, 'b-1', null)).not.toThrow()
    expect(loadAttempt(undefined, 'b-1')).toBeNull()
  })
})
