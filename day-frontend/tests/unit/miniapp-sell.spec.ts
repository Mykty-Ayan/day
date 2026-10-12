/**
 * Which nights or hours the "Sell" tab asks about. "Weekend" on a Saturday used
 * to jump to next week, and a two-night total was labelled as one night.
 */

import { expect, test } from '@playwright/test'
import { hourlyRange, nightsBetween, periodRange, weekendRange } from '../../src/pages/miniapp/sell'
import { toISODate } from '../../src/pages/miniapp/format'

const day = (iso: string) => new Date(`${iso}T10:00:00`)
const range = ([from, to]: [Date, Date]) => [toISODate(from), toISODate(to)]

test.describe('weekend', () => {
  test('on a weekday it is the coming Friday to Sunday', () => {
    expect(range(weekendRange(day('2026-10-12')))).toEqual(['2026-10-16', '2026-10-18'])
  })

  test('on Friday it starts tonight', () => {
    expect(range(weekendRange(day('2026-10-16')))).toEqual(['2026-10-16', '2026-10-18'])
  })

  test('on Saturday it is the night that is left, not next week', () => {
    expect(range(weekendRange(day('2026-10-17')))).toEqual(['2026-10-17', '2026-10-18'])
  })

  test('on Sunday the weekend is over: next Friday', () => {
    expect(range(weekendRange(day('2026-10-18')))).toEqual(['2026-10-23', '2026-10-25'])
  })
})

test.describe('periods', () => {
  test('tonight, tomorrow and own dates with a number of nights', () => {
    const today = day('2026-10-12')
    expect(range(periodRange('tonight', today, '', 1))).toEqual(['2026-10-12', '2026-10-13'])
    expect(range(periodRange('tomorrow', today, '', 1))).toEqual(['2026-10-13', '2026-10-14'])
    expect(range(periodRange('custom', today, '2026-11-20', 3))).toEqual(['2026-11-20', '2026-11-23'])
  })

  test('own dates without a date fall back to tonight', () => {
    expect(range(periodRange('custom', day('2026-10-12'), '', 3))).toEqual(['2026-10-12', '2026-10-13'])
  })

  test('nights are counted by calendar day', () => {
    expect(nightsBetween(...weekendRange(day('2026-10-12')))).toBe(2)
  })
})

test.describe('hours', () => {
  test('a slot from a start time for a number of hours, past midnight too', () => {
    expect(hourlyRange('2026-10-12', '12:00', 2)).toEqual({
      checkIn: '2026-10-12T12:00:00',
      checkOut: '2026-10-12T14:00:00',
    })
    expect(hourlyRange('2026-10-12', '22:30', 3)).toEqual({
      checkIn: '2026-10-12T22:30:00',
      checkOut: '2026-10-13T01:30:00',
    })
  })
})

test('an empty or broken date gives no slot instead of crashing the app', () => {
  expect(hourlyRange('', '12:00', 2)).toBeNull()
  expect(hourlyRange('not-a-date', '12:00', 2)).toBeNull()
  expect(hourlyRange('2026-10-12', '', 2)).toBeNull()
})
