/**
 * The analytics page's own period. The API counts [date_from, date_to): the last
 * day the owner picks must be in the report, so date_to is the day after it.
 */

import { expect, test } from '@playwright/test'
import { customRange } from '../../src/pages/analytics/period'
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
