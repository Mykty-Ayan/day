/**
 * The flat's prices: the weekend night typed as a price, kept as a markup; and the
 * warning said before the way of letting is switched.
 */

import { expect, test } from '@playwright/test'
import { modeChangeKey, shiftWeekend, weekendMarkup } from '../../src/lib/property-pricing'

test('the weekend price is kept as the markup over the base', () => {
  expect(weekendMarkup(24000, '27000')).toBe(3000)
  expect(weekendMarkup(24000, '27 000')).toBe(3000)
  expect(weekendMarkup(24000, '')).toBe(0)
  expect(weekendMarkup(24000, '20000')).toBe(0)
})

test('each switch of the way of letting says what it changes', () => {
  expect(modeChangeKey('both', 'daily')).toBe('properties.pricing.modeToDaily')
  expect(modeChangeKey('daily', 'hourly')).toBe('properties.pricing.modeToHourly')
  expect(modeChangeKey('daily', 'both')).toBe('properties.pricing.modeToBoth')
  expect(modeChangeKey('both', 'both')).toBeNull()
})

test('the weekend moves with the weekdays, also when it equals them', () => {
  expect(shiftWeekend(24000, 25000, '27000')).toBe(28000)
  // Equal at 20 000: lowered to 15 000 they stay equal, no markup appears.
  expect(shiftWeekend(20000, 15000, '20000')).toBe(15000)
})
