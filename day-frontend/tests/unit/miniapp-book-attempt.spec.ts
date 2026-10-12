/**
 * One press of "Book" while the guest is on the phone. The blacklist check
 * takes a moment; a sheet closed during it used to book the first flat anyway,
 * and a booking whose answer was lost vanished with the sheet, so the guest
 * could be booked into a second flat.
 */

import { expect, test } from '@playwright/test'
import {
  loadBookingAttempt,
  saveBookingAttempt,
  startBooking,
  type BookingAttempt,
} from '../../src/pages/miniapp/book-attempt'

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

test('an unsettled booking outlives the sheet', () => {
  const data = new Map<string, string>()
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }

  expect(saveBookingAttempt(storage, ATTEMPT)).toBe(true)
  expect(loadBookingAttempt(storage)).toEqual(ATTEMPT)
  expect(saveBookingAttempt(storage, null)).toBe(true)
  expect(loadBookingAttempt(storage)).toBeNull()
})
