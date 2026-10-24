/**
 * The Mini App's tab lives in the address, and the bookings tab splits one list
 * into upcoming, past and cancelled.
 */

import { expect, test } from '@playwright/test'
import { searchWithTab, segmentFilters, segmentItems, tabFromSearch } from '../../src/pages/miniapp/tabs'
import type { Booking } from '../../src/types/booking'

function booking(overrides: Partial<Booking>): Booking {
  return {
    id: 'b',
    check_in: '2026-10-25T14:00:00',
    check_out: '2026-10-27T12:00:00',
    status: 'confirmed',
    total_price: 30000,
    paid_amount: 0,
    ...overrides,
  } as Booking
}

test('a link names the tab to open', () => {
  expect(tabFromSearch('?tab=bookings')).toBe('bookings')
})

test('an unknown or missing tab opens Today', () => {
  expect(tabFromSearch('?tab=nope')).toBe('today')
  expect(tabFromSearch('')).toBe('today')
})

test('switching tabs keeps the booking a notice linked to', () => {
  expect(searchWithTab('?booking=42', 'units')).toBe('?booking=42&tab=units')
  expect(searchWithTab('?booking=42&tab=units', 'today')).toBe('?booking=42')
  expect(searchWithTab('?tab=units', 'today')).toBe('')
})

test('upcoming reads one window ahead, past and cancelled read page by page', () => {
  const today = new Date(2026, 9, 25)
  expect(segmentFilters('upcoming', today, '')).toEqual({
    search: undefined,
    date_from: '2026-10-25',
    date_to: '2026-11-24',
    per_page: 100,
  })
  expect(segmentFilters('past', today, ' Айгерим ', 2)).toEqual({
    search: 'Айгерим',
    date_to: '2026-10-25',
    per_page: 30,
    page: 2,
  })
  expect(segmentFilters('cancelled', today, '')).toMatchObject({ status: 'cancelled', page: 1 })
})

test('a guest still in the flat is upcoming, one who left today is past', () => {
  const now = new Date('2026-10-27T13:00:00')
  const staying = booking({ id: 'staying', check_out: '2026-10-28T12:00:00' })
  const left = booking({ id: 'left', check_out: '2026-10-27T12:00:00' })
  expect(segmentItems('upcoming', [staying, left], now, false).map((b) => b.id)).toEqual(['staying'])
  expect(segmentItems('past', [staying, left], now, false).map((b) => b.id)).toEqual(['left'])
})

test('upcoming runs from the nearest arrival, whatever order the server sent', () => {
  const now = new Date('2026-10-25T09:00:00')
  const later = booking({ id: 'later', check_in: '2026-11-02T14:00:00', check_out: '2026-11-04T12:00:00' })
  const sooner = booking({ id: 'sooner', check_in: '2026-10-26T14:00:00', check_out: '2026-10-28T12:00:00' })
  expect(segmentItems('upcoming', [later, sooner], now, false).map((b) => b.id)).toEqual(['sooner', 'later'])
})

test('a cancelled booking shows only under cancelled', () => {
  const now = new Date('2026-10-25T09:00:00')
  const cancelled = booking({ status: 'cancelled' })
  expect(segmentItems('upcoming', [cancelled], now, false)).toEqual([])
  expect(segmentItems('cancelled', [cancelled], now, false)).toEqual([cancelled])
})

test('"Unpaid" keeps only bookings with money still owed', () => {
  const now = new Date('2026-10-25T09:00:00')
  const paid = booking({ id: 'paid', paid_amount: 30000 })
  const owing = booking({ id: 'owing', paid_amount: 10000 })
  expect(segmentItems('upcoming', [paid, owing], now, true).map((b) => b.id)).toEqual(['owing'])
})
