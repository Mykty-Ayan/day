/**
 * The analytics page's own period. The API counts [date_from, date_to): the last
 * day the owner picks must be in the report, so date_to is the day after it.
 */

import { expect, test } from '@playwright/test'
import { customRange } from '../../src/pages/analytics/period'

test('the last picked day is in the report', () => {
  expect(customRange('2026-10-06', '2026-10-16')).toEqual({ date_from: '2026-10-06', date_to: '2026-10-17' })
  // Across a month end.
  expect(customRange('2026-10-25', '2026-10-31')).toEqual({ date_from: '2026-10-25', date_to: '2026-11-01' })
})

test('a period without both ends asks for nothing yet', () => {
  expect(customRange('2026-10-06', '')).toBeNull()
  expect(customRange('', '')).toBeNull()
})
