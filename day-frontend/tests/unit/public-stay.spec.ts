/**
 * The flat's page for guests: its calendar month, the price of a stay picked on
 * it, and the language it opens in.
 */

import { expect, test } from '@playwright/test'
import { guestLanguage, isHourly, monthCells, offerDates, stayDates, stayQuote } from '../../src/lib/public-stay'

test('a month is laid out from Monday, with blanks before its first day', () => {
  // 1 October 2026 is a Thursday.
  const cells = monthCells(2026, 9)
  expect(cells.slice(0, 4)).toEqual([null, null, null, '2026-10-01'])
  expect(cells.filter(Boolean)).toHaveLength(31)
  expect(cells.at(-1)).toBe('2026-10-31')
})

test('a stay costs its nights, and is free only if each night is', () => {
  const nights = [
    { date: '2026-10-20', price: 25000, free: true },
    { date: '2026-10-21', price: 25000, free: true },
    { date: '2026-10-22', price: 30000, free: false },
  ]
  expect(stayQuote(nights, '2026-10-20', '2026-10-22')).toEqual({ count: 2, total: 50000, free: true })
  expect(stayQuote(nights, '2026-10-21', '2026-10-23')).toEqual({ count: 2, total: 55000, free: false })
  // A night the page does not know (past the loaded months) is not called free.
  expect(stayQuote(nights, '2026-10-21', '2026-10-24').free).toBe(false)
})

test('the page opens in the guest\'s choice, else the phone\'s language, else English', () => {
  expect(guestLanguage('kz', 'en-US')).toBe('kz')
  expect(guestLanguage(null, 'ru-RU')).toBe('ru')
  expect(guestLanguage(null, 'kk-KZ')).toBe('kz')
  expect(guestLanguage(null, 'en-GB')).toBe('en')
  // A tourist reads English sooner than Russian.
  expect(guestLanguage(null, 'fr-FR')).toBe('en')
  expect(guestLanguage('xx', null)).toBe('en')
})

test("a stay's dates read as one range, and as two dates where the browser has no ranges", () => {
  expect(stayDates('ru-RU', '2026-10-20', '2026-10-22')).toBe('20–22 октября')
  expect(stayDates('ru-RU', '2026-10-30', '2026-11-02')).toBe('30 октября – 2 ноября')
  const range = Intl.DateTimeFormat.prototype.formatRange
  try {
    // Safari before 14.1.
    Object.defineProperty(Intl.DateTimeFormat.prototype, 'formatRange', { value: undefined, configurable: true, writable: true })
    expect(stayDates('ru-RU', '2026-10-20', '2026-10-22')).toBe('20 октября – 22 октября')
  } finally {
    Object.defineProperty(Intl.DateTimeFormat.prototype, 'formatRange', { value: range, configurable: true, writable: true })
  }
})

test('an hourly link shows its day and hours as written, never shifted by the zone', () => {
  const offer = {
    code: 'abc', guest: null, phone: '', check_in: '2030-10-20', check_out: '2030-10-21', nights: 0,
    rental_mode: 'hourly' as const, starts_at: '2030-10-20T15:00:00', ends_at: '2030-10-20T18:30:00', hours: 4,
    guests: 2, flats: [], booking: null,
  }
  expect(isHourly(offer)).toBe(true)
  expect(offerDates('ru', offer)).toBe('20 октября, 15:00–18:30')
  expect(offerDates('en', offer)).toBe('October 20, 15:00–18:30')
  // A link by the night keeps its dates.
  const nightly = { ...offer, rental_mode: 'daily' as const, starts_at: null, ends_at: null }
  expect(isHourly(nightly)).toBe(false)
  expect(offerDates('ru', nightly)).toBe(stayDates('ru', '2030-10-20', '2030-10-21'))
})
