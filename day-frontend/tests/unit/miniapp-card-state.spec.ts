/**
 * When the booking card may act. Acting on a booking read before the card was
 * opened sends stale dates or statuses: an "extend" from a cached check-out
 * can shorten a stay the CRM has already extended.
 */

import { expect, test } from '@playwright/test'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { cardRead, readyToAct, secretsFresh } from '../../src/pages/miniapp/card-state'

const OPENED = 1_000

test('a booking read since the card opened can be acted on', () => {
  expect(readyToAct({ isSuccess: true, fetchStatus: 'idle', dataUpdatedAt: 1_500 }, OPENED)).toBe(true)
})

test('a cached booking from before the card opened cannot', () => {
  expect(readyToAct({ isSuccess: true, fetchStatus: 'idle', dataUpdatedAt: 500 }, OPENED)).toBe(false)
})

test('nothing while the reread is in flight', () => {
  expect(readyToAct({ isSuccess: true, fetchStatus: 'fetching', dataUpdatedAt: 1_500 }, OPENED)).toBe(false)
})

test('nothing while the reread waits for the network', () => {
  // Offline, TanStack pauses the read: not fetching, yet the data is from before the last write.
  expect(readyToAct({ isSuccess: true, fetchStatus: 'paused', dataUpdatedAt: 1_500 }, OPENED)).toBe(false)
})

test('a failed reread keeps the card locked, even with older data shown', () => {
  expect(readyToAct({ isSuccess: false, fetchStatus: 'idle', dataUpdatedAt: 500 }, OPENED)).toBe(false)
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

// The deposit row locks on any write under its key, from this card or one closed mid-write.
test('a write from a card closed mid-request still counts for the reopened one', async () => {
  const client = new QueryClient()
  const writeKey = ['miniapp', 'deposit-write', 'b-1']
  let finish: () => void = () => {}
  const write = client
    .getMutationCache()
    .build(client, { mutationKey: writeKey, mutationFn: () => new Promise<void>((resolve) => (finish = resolve)) })
  const running = write.execute(undefined)
  await new Promise((resolve) => setTimeout(resolve, 0))

  // The card that started it is gone; the reopened card asks by key alone.
  expect(client.isMutating({ mutationKey: writeKey })).toBe(1)
  finish()
  await running
  expect(client.isMutating({ mutationKey: writeKey })).toBe(0)
})

test.describe('the lockbox code goes only with a read made just now', () => {
  const read = (dataUpdatedAt: number) => ({ isSuccess: true, fetchStatus: 'idle' as const, dataUpdatedAt })

  test('a read from the last seconds carries it', () => {
    expect(secretsFresh(read(20_000), OPENED, 30_000)).toBe(true)
  })

  test('an older read does not: the CRM may have cancelled the stay since', () => {
    expect(secretsFresh(read(10_000), OPENED, 30_000)).toBe(false)
  })

  test('nor a read the card may not act on', () => {
    expect(secretsFresh({ ...read(29_000), fetchStatus: 'fetching' }, OPENED, 30_000)).toBe(false)
    expect(secretsFresh(read(500), OPENED, 1_000)).toBe(false)
  })
})
