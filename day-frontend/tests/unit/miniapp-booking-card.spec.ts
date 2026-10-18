/**
 * The rules behind the Mini App booking card: who can be called, what can
 * still happen to a booking, how far "extend" goes, and what has been paid.
 * Each of these used to be a one-tap action with no check.
 */

import { expect, test } from '@playwright/test'
import {
  afterFailure,
  canCancel,
  extendedCheckOut,
  latestCall,
  loadAttempt,
  nextCall,
  paymentMaybeRecorded,
  phoneDigits,
  receiveOutcome,
  sameAttempt,
  saveAttempt,
  settlement,
  storedAttempt,
  suggestedDeposit,
  withMoneyLock,
  type MoneyAttempt,
} from '../../src/pages/miniapp/booking-card'
import type { BookingPayment } from '../../src/types/booking'

test.describe('phoneDigits', () => {
  test('a Kazakh number written with 8 dials as +7', () => {
    expect(phoneDigits('8 (701) 111-22-33')).toBe('77011112233')
    expect(phoneDigits('+7 701 111 22 33')).toBe('77011112233')
    expect(phoneDigits('701 111 22 33')).toBe('77011112233')
  })

  test('a number written with its own "+" keeps its country code', () => {
    // Eleven digits starting with 8, like a Kazakh "8 701…", but Hong Kong and Vietnam.
    expect(phoneDigits('+852 9123 4567')).toBe('85291234567')
    expect(phoneDigits('+84 90 123 4567')).toBe('84901234567')
    expect(phoneDigits(' +7 701 111 22 33')).toBe('77011112233')
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

test.describe('what a failure leaves of the attempt', () => {
  const attempt: MoneyAttempt = { kind: 'payment', amount: 20000, method: 'cash', key: 'k-1' }

  test('a lost answer keeps it, marked as possibly recorded', () => {
    expect(afterFailure(attempt, { response: { status: 504 } })).toEqual({ ...attempt, uncertain: true })
  })

  test('a refusal of the first call drops it: nothing was recorded', () => {
    expect(afterFailure(attempt, { response: { status: 422 } })).toBeNull()
  })

  test('once possibly recorded, a refused retry proves nothing about the first call', () => {
    const lost = { ...attempt, uncertain: true }
    // The rate limiter answers before the key is even looked up.
    expect(afterFailure(lost, { response: { status: 429 } })).toEqual(lost)
    expect(afterFailure(lost, { response: { status: 422 } })).toEqual(lost)
  })
})

test.describe('which attempt an answer belongs to', () => {
  const a: MoneyAttempt = { kind: 'payment', amount: 20000, method: 'cash', key: 'k-a' }
  const b: MoneyAttempt = { kind: 'payment', amount: 5000, method: 'cash', key: 'k-b' }

  test('the same key, whatever was learned about it since', () => {
    expect(sameAttempt({ ...a, uncertain: true }, a)).toBe(true)
  })

  test('a late answer to A is not about B', () => {
    expect(sameAttempt(b, a)).toBe(false)
    expect(sameAttempt(null, a)).toBe(false)
    expect(sameAttempt({ kind: 'receive', paymentId: 'p-1', amount: 20000 }, a)).toBe(false)
  })
})

test.describe('a late answer to an earlier send of the same attempt', () => {
  const attempt: MoneyAttempt = { kind: 'payment', amount: 20000, method: 'cash', key: 'k-1' }

  test('each send is numbered', () => {
    expect(nextCall(attempt).call).toBe(1)
    expect(nextCall(nextCall(attempt)).call).toBe(2)
  })

  test('only the latest send of the attempt on the phone may change it', () => {
    const first = nextCall(attempt)
    const retry = nextCall({ ...first, uncertain: true })
    expect(latestCall(first, first)).toBe(true)
    // The card was reopened and the retry went out: the first send's late 429
    // must not drop the retry, whose answer was lost too.
    expect(latestCall(retry, first)).toBe(false)
    expect(latestCall(null, first)).toBe(false)
    expect(latestCall(nextCall({ ...attempt, key: 'k-2' }), first)).toBe(false)
  })
})

test.describe('what a fresh read says of a "received" whose answer was lost', () => {
  const payment = (status: BookingPayment['status']) => ({ id: 'p-1', status }) as BookingPayment

  test('completed: settled', () => {
    expect(receiveOutcome(payment('completed'))).toBe('received')
  })

  test('still pending: the confirm may yet land, so only a retry may follow', () => {
    // Unblocking here let "Balance" record the money again before the late confirm.
    expect(receiveOutcome(payment('pending'))).toBe('waiting')
  })

  test('failed or gone: it can never be confirmed', () => {
    expect(receiveOutcome(payment('failed'))).toBe('gone')
    expect(receiveOutcome(undefined)).toBe('gone')
  })
})

test('the windows of the app take turns on a booking\'s money attempt', async () => {
  const asked: string[] = []
  let held = false
  const locks = {
    request: async <T,>(name: string, run: () => T | PromiseLike<T>): Promise<T> => {
      asked.push(name)
      expect(held).toBe(false)
      held = true
      try {
        return await run()
      } finally {
        held = false
      }
    },
  }

  expect(await withMoneyLock('b-1', () => 'read and kept', locks)).toBe('read and kept')
  expect(asked).toEqual(['day.miniapp.money.b-1'])
  // Without Web Locks (an old webview) it still runs.
  expect(await withMoneyLock('b-1', () => 'alone', undefined)).toBe('alone')
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
    // Found again after the app was closed mid-request: its first answer may never have been seen.
    expect(loadAttempt(storage, 'b-1')).toEqual({ ...attempt, uncertain: true })
    expect(loadAttempt(storage, 'b-2')).toBeNull()

    saveAttempt(storage, 'b-1', null)
    expect(loadAttempt(storage, 'b-1')).toBeNull()
  })

  test('as kept, it says what the last send knew, to judge the failure of that send', () => {
    const storage = memory()
    const attempt: MoneyAttempt = { kind: 'payment', amount: 20000, method: 'cash', key: 'k-1', call: 1 }
    saveAttempt(storage, 'b-1', attempt)
    expect(storedAttempt(storage, 'b-1')).toEqual(attempt)
    expect(storedAttempt(storage, 'b-2')).toBeNull()
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

  test('says when the attempt could not be kept, so the money is not sent unkept', () => {
    const full = { ...memory(), setItem: () => { throw new Error('QuotaExceededError') } }
    const attempt: MoneyAttempt = { kind: 'payment', amount: 20000, method: 'cash', key: 'k-1' }

    expect(saveAttempt(full, 'b-1', attempt)).toBe(false)
    expect(saveAttempt(undefined, 'b-1', attempt)).toBe(false)
    expect(saveAttempt(memory(), 'b-1', attempt)).toBe(true)
  })
})

test.describe('the deposit the card suggests', () => {
  const pricing = { default_deposit: 10000, hourly_deposit: 7000 }

  test('is the deposit of the kind of stay the booking is', () => {
    expect(suggestedDeposit('hourly', pricing, 18000)).toBe(7000)
    expect(suggestedDeposit('daily', pricing, 50000)).toBe(10000)
  })

  test('never names the nightly deposit, nor the total, for hours: the operator types it', () => {
    expect(suggestedDeposit('hourly', { ...pricing, hourly_deposit: 0 }, 18000)).toBeNull()
    // Still loading the flat: nothing to offer for hours either.
    expect(suggestedDeposit('hourly', undefined, 18000)).toBeNull()
  })

  test('a night with no deposit set offers the total, as before', () => {
    expect(suggestedDeposit('daily', { ...pricing, default_deposit: 0 }, 50000)).toBe(50000)
    expect(suggestedDeposit('daily', undefined, 50000)).toBe(50000)
  })
})
