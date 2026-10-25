/**
 * Two weeks of a flat, night by night: a stay holds its nights but not the
 * morning it leaves, a closed range is closed, a cancelled stay frees the nights.
 */

import { expect, test } from '@playwright/test'
import { flatOccupancy, occupancy } from '../../src/pages/miniapp/occupancy'
import { segmentFilters } from '../../src/pages/miniapp/tabs'
import type { Booking, GanttPropertyRow } from '../../src/types/booking'

const start = new Date(2026, 9, 25)

function row(overrides: Partial<GanttPropertyRow>): GanttPropertyRow {
  return { id: 'p', name: 'Студия', internal_name: 'S1', type: 'apartment', status: 'active', bookings: [], ...overrides }
}

function stay(id: string, checkIn: string, checkOut: string, status = 'confirmed'): Booking {
  return { id, check_in: checkIn, check_out: checkOut, status, guest_name: id } as Booking
}

const states = (value: ReturnType<typeof flatOccupancy>) => value.nights.map((night) => night.state[0]).join('')

test('a stay holds its nights, not the morning it leaves', () => {
  const flat = flatOccupancy(row({ bookings: [stay('a', '2026-10-26T14:00:00', '2026-10-28T12:00:00')] }), start, 5)
  expect(states(flat)).toBe('fbbff')
  expect(flat.free).toBe(3)
})

test('a closed range is closed, a stay over it still shows as booked', () => {
  const flat = flatOccupancy(
    row({
      bookings: [stay('a', '2026-10-25T14:00:00', '2026-10-26T12:00:00')],
      blocks: [{ id: 'x', start_date: '2026-10-25', end_date: '2026-10-28', reason: null }],
    }),
    start,
    4,
  )
  expect(states(flat)).toBe('bccf')
})

test('a stay of a few hours holds its day; a cancelled stay holds nothing', () => {
  const flat = flatOccupancy(
    row({
      bookings: [
        stay('hours', '2026-10-26T15:00:00', '2026-10-26T18:00:00'),
        stay('gone', '2026-10-27T14:00:00', '2026-10-29T12:00:00', 'cancelled'),
      ],
    }),
    start,
    4,
  )
  expect(states(flat)).toBe('fbff')
  expect(flat.bookings.map((booking) => booking.id)).toEqual(['hours'])
})

test('stays are listed nearest first and an archived flat is left out', () => {
  const flats = occupancy(
    [
      row({
        id: 'live',
        bookings: [stay('later', '2026-11-01T14:00:00', '2026-11-02T12:00:00'), stay('sooner', '2026-10-26T14:00:00', '2026-10-27T12:00:00')],
      }),
      row({ id: 'old', status: 'archived' }),
    ],
    start,
  )
  expect(flats.map((flat) => flat.id)).toEqual(['live'])
  expect(flats[0].nights).toHaveLength(14)
  expect(flats[0].bookings.map((booking) => booking.id)).toEqual(['sooner', 'later'])
})

test('the bookings list asks the server for one flat only when one is chosen', () => {
  expect(segmentFilters('past', start, '', 1, 'flat-1')).toMatchObject({ property_id: 'flat-1' })
  expect(segmentFilters('past', start, '').property_id).toBeUndefined()
})
