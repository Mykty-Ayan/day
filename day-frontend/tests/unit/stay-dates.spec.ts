/** The first night of a stay is priced from its check-in to the next day, at the same hour. */

import { expect, test } from '@playwright/test'
import { nextDay, nightsOf } from '../../src/lib/stay-dates'

test('the next day keeps the hour and crosses months and years', () => {
  expect(nextDay('2026-11-24T14:00:00')).toBe('2026-11-25T14:00:00')
  expect(nextDay('2026-11-30T14:00:00')).toBe('2026-12-01T14:00:00')
  expect(nextDay('2026-12-31T22:00:00')).toBe('2027-01-01T22:00:00')
  expect(nextDay('2026-11-24')).toBe('2026-11-25T14:00:00')
})

test('nights count calendar days, whatever the hours', () => {
  expect(nightsOf('2026-11-24T14:00:00', '2026-11-27T12:00:00')).toBe(3)
  expect(nightsOf('2026-11-24T22:00:00', '2026-11-25T12:00:00')).toBe(1)
  expect(nightsOf('2026-03-28T14:00:00', '2026-04-02T12:00:00')).toBe(5)
})
