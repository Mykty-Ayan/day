/**
 * A long export reads many pages in a row; a page the server refuses for its rate limit
 * waits for the limit's window to end and is asked again, rather than losing the file.
 */

import { expect, test } from '@playwright/test'
import { patiently, rateLimitWait } from '../../src/lib/patiently'

const refused = (reset?: number) => ({ response: { status: 429, headers: reset ? { 'x-ratelimit-reset': String(reset) } : {} } })

test('the wait lasts until the second the server names, a little after it', () => {
  expect(rateLimitWait(refused(1_000), 980_000)).toBe(20_500)
  // Never shorter than a second, never longer than a window.
  expect(rateLimitWait(refused(1_000), 1_000_000)).toBe(1_000)
  expect(rateLimitWait(refused(), 0)).toBe(61_000)
  expect(rateLimitWait(refused(5_000), 0)).toBe(61_000)
})

test('another error is no rate limit', () => {
  expect(rateLimitWait({ response: { status: 500 } }, 0)).toBeNull()
  expect(rateLimitWait(new Error('network'), 0)).toBeNull()
})

test('a refused page is asked again after the wait, and the answer comes back', async () => {
  const waits: number[] = []
  let calls = 0
  const page = await patiently(
    async () => {
      calls += 1
      if (calls === 1) throw refused(10)
      return 'page 2'
    },
    { sleep: async (ms) => void waits.push(ms), now: () => 5_000 },
  )
  expect(page).toBe('page 2')
  expect(waits).toEqual([5_500])
})

test('the limit refusing again and again ends in the error; another error is not retried', async () => {
  let calls = 0
  await expect(
    patiently(async () => {
      calls += 1
      throw refused(10)
    }, { sleep: async () => {}, now: () => 0 }),
  ).rejects.toEqual(refused(10))
  expect(calls).toBe(3)

  calls = 0
  await expect(
    patiently(async () => {
      calls += 1
      throw new Error('500')
    }, { sleep: async () => {} }),
  ).rejects.toThrow('500')
  expect(calls).toBe(1)
})
