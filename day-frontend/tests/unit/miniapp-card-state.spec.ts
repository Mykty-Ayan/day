/**
 * When the booking card may act. Acting on a booking read before the card was
 * opened sends stale dates or statuses: an "extend" from a cached check-out
 * can shorten a stay the CRM has already extended.
 */

import { expect, test } from '@playwright/test'
import { linkedBookingId, readyToAct } from '../../src/pages/miniapp/card-state'

const OPENED = 1_000

test('a booking read since the card opened can be acted on', () => {
  expect(readyToAct({ isSuccess: true, isFetching: false, dataUpdatedAt: 1_500 }, OPENED)).toBe(true)
})

test('a cached booking from before the card opened cannot', () => {
  expect(readyToAct({ isSuccess: true, isFetching: false, dataUpdatedAt: 500 }, OPENED)).toBe(false)
})

test('nothing while the reread is in flight', () => {
  expect(readyToAct({ isSuccess: true, isFetching: true, dataUpdatedAt: 1_500 }, OPENED)).toBe(false)
})

test('a failed reread keeps the card locked, even with older data shown', () => {
  expect(readyToAct({ isSuccess: false, isFetching: false, dataUpdatedAt: 500 }, OPENED)).toBe(false)
})

// The "Open booking" button under a bot notice opens /tma?booking=<id>.
test('the booking a notice links to', () => {
  const id = '6f1c2a40-1d2b-4c3e-9f00-0123456789ab'
  expect(linkedBookingId(`?booking=${id}`)).toBe(id)
})

test('no booking without the parameter or with a broken one', () => {
  expect(linkedBookingId('')).toBeNull()
  expect(linkedBookingId('?booking=undefined')).toBeNull()
})
