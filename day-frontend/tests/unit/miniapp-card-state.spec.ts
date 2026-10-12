/**
 * When the booking card may act. Acting on a booking read before the card was
 * opened sends stale dates or statuses: an "extend" from a cached check-out
 * can shorten a stay the CRM has already extended.
 */

import { expect, test } from '@playwright/test'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { cardRead, readyToAct } from '../../src/pages/miniapp/card-state'

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

// Closed mid-read, reopened, the CRM cancelled meanwhile: the reopened card used
// to adopt the answer to the first request, "confirmed", stamped after it opened.
test('a card closed mid-read drops that read; the reopened card reads afresh', async () => {
  const client = new QueryClient()
  const calls: { signal: AbortSignal; answer: (status: string) => void }[] = []
  const options = cardRead(['miniapp', 'booking', 'b-1'], (signal) =>
    new Promise<string>((resolve) => calls.push({ signal, answer: resolve })),
  )

  const first = new QueryObserver(client, options)
  const closeFirst = first.subscribe(() => {})
  closeFirst()
  expect(calls[0].signal.aborted).toBe(true)

  const openedAt = Date.now()
  const second = new QueryObserver(client, options)
  second.subscribe(() => {})
  expect(calls).toHaveLength(2)

  calls[0].answer('confirmed')
  calls[1].answer('cancelled')
  await new Promise((resolve) => setTimeout(resolve, 0))

  const read = second.getCurrentResult()
  expect(read.data).toBe('cancelled')
  expect(readyToAct(read, openedAt)).toBe(true)
})
