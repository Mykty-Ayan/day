/**
 * The Mini App's hooks into Telegram's own controls. Without them Android's
 * back gesture closes the whole app instead of a sheet, and a swipe down
 * minimises it in the middle of typing a booking.
 */

import { expect, test } from '@playwright/test'
import { initTelegram, setClosingConfirmation, showBackButton } from '../../src/lib/telegram'

type Call = string

function fakeTelegram(version: string) {
  const calls: Call[] = []
  const handlers = new Set<() => void>()
  const app = {
    version,
    initData: 'x',
    colorScheme: 'light',
    themeParams: {},
    ready: () => calls.push('ready'),
    expand: () => calls.push('expand'),
    close: () => calls.push('close'),
    isVersionAtLeast: (v: string) => Number(version) >= Number(v),
    disableVerticalSwipes: () => calls.push('disableVerticalSwipes'),
    enableClosingConfirmation: () => calls.push('enableClosingConfirmation'),
    disableClosingConfirmation: () => calls.push('disableClosingConfirmation'),
    BackButton: {
      show: () => calls.push('back.show'),
      hide: () => calls.push('back.hide'),
      onClick: (cb: () => void) => handlers.add(cb),
      offClick: (cb: () => void) => handlers.delete(cb),
    },
  }
  ;(globalThis as unknown as { window: unknown }).window = { Telegram: { WebApp: app } }
  return { calls, handlers }
}

test.afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window
})

test('a sheet shows Telegram back, and closing it removes exactly its handler', () => {
  const { calls, handlers } = fakeTelegram('8.0')
  let closed = 0
  const cleanup = showBackButton(() => closed++)

  expect(calls).toContain('back.show')
  ;[...handlers].forEach((handler) => handler())
  expect(closed).toBe(1)

  cleanup()
  expect(calls.at(-1)).toBe('back.hide')
  expect(handlers.size).toBe(0)
})

test('swipes no longer minimise the app on clients that support it', () => {
  const { calls } = fakeTelegram('7.7')
  initTelegram()
  expect(calls).toEqual(['ready', 'expand', 'disableVerticalSwipes'])
})

test('older clients are left alone instead of throwing', () => {
  const { calls } = fakeTelegram('6.9')
  initTelegram()
  expect(calls).toEqual(['ready', 'expand'])
})

test('closing confirmation follows unsaved input', () => {
  const { calls } = fakeTelegram('8.0')
  setClosingConfirmation(true)
  setClosingConfirmation(false)
  expect(calls).toEqual(['enableClosingConfirmation', 'disableClosingConfirmation'])
})

test('outside Telegram everything is a no-op', () => {
  delete (globalThis as unknown as { window?: unknown }).window
  ;(globalThis as unknown as { window: unknown }).window = {}
  expect(() => showBackButton(() => {})()).not.toThrow()
  expect(() => setClosingConfirmation(true)).not.toThrow()
})

test('two screens: back closes only the top one, and the arrow stays until both are gone', () => {
  const { calls, handlers } = fakeTelegram('8.0')
  const closed: string[] = []
  const closeBottom = showBackButton(() => closed.push('bottom'))
  const closeTop = showBackButton(() => closed.push('top'))

  ;[...handlers].forEach((handler) => handler())
  expect(closed).toEqual(['top'])

  closeTop()
  expect(calls.at(-1)).not.toBe('back.hide')
  ;[...handlers].forEach((handler) => handler())
  expect(closed).toEqual(['top', 'bottom'])

  closeBottom()
  expect(calls.at(-1)).toBe('back.hide')
  expect(handlers.size).toBe(0)
})
