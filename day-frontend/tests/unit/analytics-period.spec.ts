/**
 * The analytics page's own period. The API counts [date_from, date_to): the last
 * day the owner picks must be in the report, so date_to is the day after it.
 */

import { expect, test } from '@playwright/test'
import { addDays, format, parseISO } from 'date-fns'
import { alignPrevious, changeOf, customRange, monthsWindow, niceTop, previousRange } from '../../src/pages/analytics/period'
import { pickStayDay } from '../../src/lib/booking-dates'

test('the last picked day is in the report', () => {
  expect(customRange('2026-10-06', '2026-10-16')).toEqual({ date_from: '2026-10-06', date_to: '2026-10-17' })
  // Across a month end.
  expect(customRange('2026-10-25', '2026-10-31')).toEqual({ date_from: '2026-10-25', date_to: '2026-11-01' })
})

test('a period without both ends asks for nothing yet', () => {
  expect(customRange('2026-10-06', '')).toBeNull()
  expect(customRange('', '')).toBeNull()
})

test('a report can cover one day: picked twice, it is the first and the last', () => {
  // The booking calendar wants a check-out after the check-in; a report does not.
  expect(pickStayDay('2026-10-16', '', '2026-10-16', { sameDay: true })).toEqual({
    checkIn: '2026-10-16',
    checkOut: '2026-10-16',
  })
  expect(customRange('2026-10-16', '2026-10-16')).toEqual({ date_from: '2026-10-16', date_to: '2026-10-17' })
  // A booking still starts over on the same day.
  expect(pickStayDay('2026-10-16', '', '2026-10-16')).toEqual({ checkIn: '2026-10-16', checkOut: '' })
})

test('the numbers are compared with the period just before, as long', () => {
  // A rolling month of 31 days (the API's «month»): the 31 days before it.
  expect(previousRange('2026-10-24', '2026-11-24')).toEqual({ date_from: '2026-09-23', date_to: '2026-10-24' })
  // One day: the day before.
  expect(previousRange('2026-10-16', '2026-10-17')).toEqual({ date_from: '2026-10-15', date_to: '2026-10-16' })
})

test('a change is in percent of what was; from nothing there is none', () => {
  expect(changeOf(120, 100)).toBeCloseTo(20)
  expect(changeOf(80, 100)).toBeCloseTo(-20)
  expect(changeOf(100, 0)).toBeNull()
  // A loss of 100 turned into a profit of 50: up, not down.
  expect(changeOf(50, -100)).toBeCloseTo(150)
})

test('revenue by month: five months before this one, this one, three ahead', () => {
  expect(monthsWindow('2026-11-24')).toEqual({ date_from: '2026-06-01', date_to: '2027-03-01', current: '2026-11-01' })
  // Across the new year, on the first day of a month.
  expect(monthsWindow('2027-01-01')).toEqual({ date_from: '2026-08-01', date_to: '2027-05-01', current: '2027-01-01' })
})

test('the scale of a chart tops at a round sum just above the largest value', () => {
  expect(niceTop(0)).toBe(0)
  expect(niceTop(83_400)).toBe(100_000)
  expect(niceTop(180_000)).toBe(200_000)
  expect(niceTop(210_000)).toBe(250_000)
  expect(niceTop(380_000)).toBe(400_000)
  // A month of 1.1 million fills most of the height, not half of a 2 million scale.
  expect(niceTop(1_100_000)).toBe(1_500_000)
  // A value on a round sum is its own top: the grid does not leave an empty band.
  expect(niceTop(50)).toBe(50)
  expect(niceTop(100)).toBe(100)
})

test('a month of this period is set against the same days of the period before, not by index', () => {
  // March 2026 by month: one bar of 31 days. The period before is 29 January – 28 February:
  // by month the API gives two bars (3 and 28 days); by day, 31 days that line up with March's.
  const days = Array.from({ length: 31 }, (_, i) => ({
    period_start: format(addDays(parseISO('2026-01-29'), i), 'yyyy-MM-dd'),
    revenue: 100,
    bookings_count: i === 0 ? 1 : 0,
    booked_nights: 1,
    occupancy_rate: i < 10 ? 100 : 0,
  }))
  const [march] = alignPrevious([{ period_start: '2026-03-01' }], '2026-03-01', '2026-04-01', '2026-01-29', days)
  expect(march).toEqual({
    first: '2026-01-29',
    last: '2026-02-28',
    revenue: 3100,
    bookings_count: 1,
    booked_nights: 31,
    occupancy_rate: (10 * 100) / 31,
  })
})

test('weeks that start mid-period take the days at the same distance from its start', () => {
  const days = Array.from({ length: 10 }, (_, i) => ({
    period_start: format(addDays(parseISO('2026-10-22'), i), 'yyyy-MM-dd'),
    revenue: i + 1,
    bookings_count: 0,
    booked_nights: 0,
    occupancy_rate: 0,
  }))
  // This period: 1–10 November, a bar of 2 days then one of 7 and one of 1.
  const bars = [{ period_start: '2026-11-01' }, { period_start: '2026-11-03' }, { period_start: '2026-11-10' }]
  const aligned = alignPrevious(bars, '2026-11-01', '2026-11-11', '2026-10-22', days)
  expect(aligned.map((bar) => bar?.revenue)).toEqual([1 + 2, 3 + 4 + 5 + 6 + 7 + 8 + 9, 10])
  expect(aligned.map((bar) => [bar?.first, bar?.last])).toEqual([
    ['2026-10-22', '2026-10-23'],
    ['2026-10-24', '2026-10-30'],
    ['2026-10-31', '2026-10-31'],
  ])
  // A day the period before did not have: nothing to compare with.
  expect(alignPrevious([{ period_start: '2026-11-01' }], '2026-11-01', '2026-11-02', '2026-10-31', [])).toEqual([null])
})
