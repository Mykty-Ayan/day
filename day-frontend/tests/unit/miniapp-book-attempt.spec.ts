/**
 * One press of "Book" while the guest is on the phone. The blacklist check
 * takes a moment; a sheet closed during it used to book the first flat anyway,
 * and a booking whose answer was lost vanished with the sheet, so the guest
 * could be booked into a second flat.
 */

import { expect, test } from '@playwright/test'
import {
  companyFromToken,
  latestBookingCall,
  loadBookingAttempt,
  saveBookingAttempt,
  startBooking,
  storedBookingAttempt,
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
      keep: (attempt: BookingAttempt) => {
        kept.push(attempt)
        return true
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

test('nothing is sent if the phone would not keep the attempt', async () => {
  const run = steps({ keep: () => false })

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
