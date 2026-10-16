/**
 * The booking form's date and time inputs. The time list opened at 00:00 with
 * 96 slots, so every booking began with a long scroll. Switching between
 * daily and hourly dropped the date the operator had already picked.
 */

import { expect, test } from '@playwright/test'
import { switchRentalMode } from '../../src/lib/booking-dates'
import { TIME_OPTIONS, nearestOption } from '../../src/components/ui/time-options'

const empty = { check_in: '', check_out: '', rental_mode: 'daily' as const, hourly_date: '' }

test('an empty time list opens at 09:00', () => {
  expect(nearestOption('')).toBe('09:00')
  expect(nearestOption(undefined)).toBe('09:00')
})

test('the time list goes in 30-minute steps', () => {
  expect(TIME_OPTIONS).toHaveLength(48)
  expect(TIME_OPTIONS.slice(18, 21)).toEqual(['09:00', '09:30', '10:00'])
})

test('a set time opens on itself or the nearest slot', () => {
  expect(nearestOption('14:30')).toBe('14:30')
  expect(nearestOption('14:40')).toBe('14:30')
  expect(nearestOption('14:50')).toBe('15:00')
})

test('daily to hourly keeps the check-in date as the hourly date', () => {
  const form = { ...empty, check_in: '2026-10-20', check_out: '2026-10-22' }
  expect(switchRentalMode(form, 'hourly')).toMatchObject({ rental_mode: 'hourly', hourly_date: '2026-10-20' })
})

test('hourly to daily keeps the hourly date as the check-in', () => {
  const form = { ...empty, rental_mode: 'hourly' as const, hourly_date: '2026-10-20' }
  expect(switchRentalMode(form, 'daily')).toMatchObject({
    rental_mode: 'daily',
    check_in: '2026-10-20',
    check_out: '',
  })
})

test('a check-out that no longer follows the moved check-in is dropped', () => {
  // Daily 10→12, switched to hourly, moved to the 15th, back to daily: 15→12 is no range.
  const form = { check_in: '2026-10-10', check_out: '2026-10-12', rental_mode: 'hourly' as const, hourly_date: '2026-10-15' }
  expect(switchRentalMode(form, 'daily')).toMatchObject({ check_in: '2026-10-15', check_out: '' })
  // A check-out still after the check-in stays.
  const later = { ...form, hourly_date: '2026-10-11' }
  expect(switchRentalMode(later, 'daily')).toMatchObject({ check_in: '2026-10-11', check_out: '2026-10-12' })
})

test('a saved booking carries its date, not its clock time', () => {
  // The edit page loads check-in/out with the time: 14:00 must not end up inside the hourly date.
  const daily = { check_in: '2026-10-20T14:00:00', check_out: '2026-10-22T12:00:00', rental_mode: 'daily' as const, hourly_date: '' }
  expect(switchRentalMode(daily, 'hourly')).toMatchObject({ hourly_date: '2026-10-20' })
  // An hourly booking ends the same day: that end is no daily check-out.
  const hourly = { check_in: '2026-10-20T10:00:00', check_out: '2026-10-20T12:00:00', rental_mode: 'hourly' as const, hourly_date: '2026-10-20' }
  expect(switchRentalMode(hourly, 'daily')).toMatchObject({ check_in: '2026-10-20', check_out: '' })
})

test('switching with no date picked yet keeps the fields empty', () => {
  expect(switchRentalMode(empty, 'hourly')).toMatchObject({ hourly_date: '' })
  expect(switchRentalMode({ ...empty, rental_mode: 'hourly' }, 'daily')).toMatchObject({ check_in: '', check_out: '' })
})
