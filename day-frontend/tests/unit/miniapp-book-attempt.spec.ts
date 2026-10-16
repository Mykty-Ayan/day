/**
 * One press of "Book" while the guest is on the phone. The blacklist check
 * takes a moment; a sheet closed during it used to book the first flat anyway,
 * and a booking whose answer was lost vanished with the sheet, so the guest
 * could be booked into a second flat.
 */

import { expect, test } from '@playwright/test'
import {
  attemptSheet,
  companyFromToken,
  latestBookingCall,
  loadBookingAttempt,
  saveBookingAttempt,
  startBooking,
  storedBookingAttempt,
  withBookingLock,
  type BookingAttempt,
} from '../../src/pages/miniapp/book-attempt'
import { nextCall } from '../../src/pages/miniapp/booking-card'

const ATTEMPT: BookingAttempt = {
  unit: '89auc',
  key: 'k-1',
  body: {
    property_id: 'p-1',
    guest_name: 'Ерлан',
    guest_phone: '+7 701 000 00 00',
    check_in: '2026-10-12',
    check_out: '2026-10-13',
    rental_mode: 'daily',
    source: 'direct',
    adults_count: 2,
    children_count: 0,
  },
}

function steps(overrides: Partial<Parameters<typeof startBooking>[1]> = {}) {
  const sent: BookingAttempt[] = []
  const kept: BookingAttempt[] = []
  return {
    sent,
    kept,
    steps: {
      digits: '77010000000',
      check: async () => ({ warned: false }),
      confirmWarned: async () => true,
      isOpen: () => true,
      claim: async (attempt: BookingAttempt) => {
        kept.push(attempt)
        return 'kept' as const
      },
      send: (attempt: BookingAttempt) => void sent.push(attempt),
      ...overrides,
    },
  }
}

test('the attempt is kept on the phone before it is sent', async () => {
  const run = steps()

  expect(await startBooking(ATTEMPT, run.steps)).toBe('sent')
  expect(run.kept).toEqual([ATTEMPT])
  expect(run.sent).toEqual([ATTEMPT])
})

test('a sheet closed during the blacklist check books nothing', async () => {
  let open = true
  const run = steps({
    check: async () => {
      open = false // the operator closed the sheet and went on to another flat
      return { warned: false }
    },
    isOpen: () => open,
  })

  expect(await startBooking(ATTEMPT, run.steps)).toBe('closed')
  expect(run.sent).toEqual([])
})

test('a failed check books nothing: the server does not ask the blacklist itself', async () => {
  const run = steps({
    check: async () => {
      throw new Error('timeout')
    },
  })

  expect(await startBooking(ATTEMPT, run.steps)).toBe('checkFailed')
  expect(run.sent).toEqual([])
})

test('a warned guest is booked only on the operator’s yes', async () => {
  const run = steps({ check: async () => ({ warned: true }), confirmWarned: async () => false })

  expect(await startBooking(ATTEMPT, run.steps)).toBe('declined')
  expect(run.sent).toEqual([])
})

test('a booking started meanwhile in another window is not overwritten', async () => {
  const other = { ...ATTEMPT, key: 'k-other', uncertain: true }
  const run = steps({ claim: async () => (other ? 'busy' : 'kept') })

  expect(await startBooking(ATTEMPT, run.steps)).toBe('busy')
  expect(run.sent).toEqual([])
})

test('the windows of the app take turns on the attempt, one lock per company', async () => {
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

  expect(await withBookingLock('c-1', () => 'read and kept', locks)).toBe('read and kept')
  expect(asked).toEqual(['day.miniapp.booking.c-1'])
  // Without Web Locks (an old webview) it still runs.
  expect(await withBookingLock('c-1', () => 'alone', undefined)).toBe('alone')
})

test('nothing is sent if the phone would not keep the attempt', async () => {
  const run = steps({ claim: async () => 'notKept' as const })

  expect(await startBooking(ATTEMPT, run.steps)).toBe('notKept')
  expect(run.sent).toEqual([])
})

function memory() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

test('an unsettled booking outlives the sheet, and counts as possibly made', () => {
  const storage = memory()

  expect(saveBookingAttempt(storage, 'c-1', ATTEMPT)).toBe(true)
  // Found again after the app was closed mid-request: its first answer may never have been seen.
  expect(loadBookingAttempt(storage, 'c-1')).toEqual({ ...ATTEMPT, uncertain: true })
  expect(saveBookingAttempt(storage, 'c-1', null)).toBe(true)
  expect(loadBookingAttempt(storage, 'c-1')).toBeNull()
})

test('one company never sees, retries or discards another company’s attempt', () => {
  const storage = memory()
  saveBookingAttempt(storage, 'c-1', ATTEMPT)

  // The chat was relinked to another company since.
  expect(loadBookingAttempt(storage, 'c-2')).toBeNull()
})

test('the company comes from the session token', () => {
  const payload = btoa(JSON.stringify({ sub: 'u-1', company_id: 'c-1' })).replace(/=+$/, '')
  expect(companyFromToken(`h.${payload}.s`)).toBe('c-1')
  expect(companyFromToken('broken')).toBeNull()
  expect(companyFromToken(null)).toBeNull()
})

test.describe('a late answer to an earlier send of the same booking', () => {
  test('only the latest send of the attempt on the phone may change it', () => {
    const first = nextCall(ATTEMPT)
    const retry = nextCall({ ...first, uncertain: true })
    expect(first.call).toBe(1)
    expect(latestBookingCall(first, first)).toBe(true)
    // The sheet was reopened and the retry went out: the first send's late 429
    // must not drop the retry, whose answer was lost too.
    expect(latestBookingCall(retry, first)).toBe(false)
    expect(latestBookingCall(null, first)).toBe(false)
    expect(latestBookingCall(nextCall({ ...ATTEMPT, key: 'k-2' }), first)).toBe(false)
  })

  test('as kept, it says what the last send knew', () => {
    const storage = memory()
    const sent = nextCall(ATTEMPT)
    saveBookingAttempt(storage, 'c-1', sent)
    expect(storedBookingAttempt(storage, 'c-1')).toEqual(sent)
    expect(storedBookingAttempt(storage, 'c-2')).toBeNull()
  })
})

test('a stored attempt reopens its sheet even when its flat is no longer free', () => {
  // The lost answer may be the booking that took the last free flat: the free list
  // is empty, yet the attempt must still be retried or checked from its sheet.
  const { unit, range } = attemptSheet(ATTEMPT)
  expect(unit.property_id).toBe(ATTEMPT.body.property_id)
  expect(unit.name).toBe('89auc')
  // The sheet sends the range as it is: the same body goes out under the same key.
  expect(range).toEqual({
    checkIn: ATTEMPT.body.check_in,
    checkOut: ATTEMPT.body.check_out,
    rentalMode: ATTEMPT.body.rental_mode,
    guests: ATTEMPT.body.adults_count,
  })
})
