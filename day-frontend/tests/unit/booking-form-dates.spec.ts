/**
 * The booking form's date and time inputs. The time list opened at 00:00 with
 * 96 slots, so every booking began with a long scroll. Switching between
 * daily and hourly dropped the date the operator had already picked.
 */

import { expect, test } from '@playwright/test'
import { blockNights, bookedNights, isDayBlocked, nightsWindow, pickStayDay, switchRentalMode, type Stay } from '../../src/lib/booking-dates'
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

// --- Booked nights in the daily calendar ---

const stay = (id: string, check_in: string, check_out: string, extra: Partial<Stay> = {}): Stay => ({
  id,
  check_in,
  check_out,
  status: 'confirmed',
  rental_mode: 'daily',
  ...extra,
})

test('a stay books the nights from its check-in to the night before its check-out', () => {
  const nights = bookedNights([stay('b1', '2026-10-20T14:00:00', '2026-10-23T12:00:00')])
  expect([...nights].sort()).toEqual(['2026-10-20', '2026-10-21', '2026-10-22'])
})

test('cancelled, completed and hourly bookings book no nights', () => {
  const nights = bookedNights([
    stay('b1', '2026-10-20T14:00:00', '2026-10-21T12:00:00', { status: 'cancelled' }),
    stay('b2', '2026-10-22T14:00:00', '2026-10-23T12:00:00', { status: 'completed' }),
    stay('b3', '2026-10-24T10:00:00', '2026-10-24T13:00:00', { rental_mode: 'hourly' }),
  ])
  expect(nights.size).toBe(0)
})

test('the booking being edited does not block its own nights', () => {
  const both = [stay('b1', '2026-10-20T14:00:00', '2026-10-22T12:00:00'), stay('b2', '2026-10-25T14:00:00', '2026-10-26T12:00:00')]
  expect([...bookedNights(both, 'b1')]).toEqual(['2026-10-25'])
})

test('with no check-in picked, a booked night cannot start a stay', () => {
  const booked = new Set(['2026-10-20', '2026-10-21'])
  expect(isDayBlocked('2026-10-20', booked, null)).toBe(true)
  expect(isDayBlocked('2026-10-22', booked, null)).toBe(false)
  expect(isDayBlocked('2026-10-19', booked, null)).toBe(false)
})

test('after a check-in, the stay can end on the first booked night and not past it', () => {
  // Booked 20th and 21st. Check-in on the 17th: out on the 18th–20th (the next guest
  // arrives the day this one leaves), never the 21st or later.
  const booked = new Set(['2026-10-20', '2026-10-21'])
  expect(isDayBlocked('2026-10-18', booked, '2026-10-17')).toBe(false)
  expect(isDayBlocked('2026-10-20', booked, '2026-10-17')).toBe(false)
  expect(isDayBlocked('2026-10-21', booked, '2026-10-17')).toBe(true)
  expect(isDayBlocked('2026-10-25', booked, '2026-10-17')).toBe(true)
  // A click before the check-in starts a new stay: booked nights stay closed.
  expect(isDayBlocked('2026-10-15', booked, '2026-10-22')).toBe(false)
  expect(isDayBlocked('2026-10-21', booked, '2026-10-22')).toBe(true)
  // Nothing booked after the check-in: any later day.
  expect(isDayBlocked('2026-11-30', booked, '2026-10-22')).toBe(false)
})

test('a click picks the check-out after a check-in, and starts a new stay otherwise', () => {
  expect(pickStayDay('', '', '2026-10-20')).toEqual({ checkIn: '2026-10-20', checkOut: '' })
  expect(pickStayDay('2026-10-20', '', '2026-10-23')).toEqual({ checkIn: '2026-10-20', checkOut: '2026-10-23' })
  expect(pickStayDay('2026-10-20', '', '2026-10-18')).toEqual({ checkIn: '2026-10-18', checkOut: '' })
  // A full stay picked: the next click starts over instead of stretching it across booked nights.
  expect(pickStayDay('2026-10-20', '2026-10-23', '2026-10-27')).toEqual({ checkIn: '2026-10-27', checkOut: '' })
})

test('the calendar loads the two months on screen', () => {
  expect(nightsWindow(new Date(2026, 9, 16), null)).toEqual({ from: '2026-10-01', to: '2026-12-01' })
})

test('with a check-in picked, the loaded nights start at the check-in, however far the calendar pages', () => {
  // Check-in 17 October, calendar paged to December: a stay to 1 December crosses
  // October's bookings, so October must stay loaded.
  expect(nightsWindow(new Date(2026, 11, 1), '2026-10-17')).toEqual({ from: '2026-10-17', to: '2027-02-01' })
  // The edit form holds the check-in with its time.
  expect(nightsWindow(new Date(2026, 11, 1), '2026-10-17T14:00:00').from).toBe('2026-10-17')
  // A check-in inside the window changes nothing.
  expect(nightsWindow(new Date(2026, 9, 1), '2026-10-17')).toEqual({ from: '2026-10-01', to: '2026-12-01' })
})

test('a closed stretch takes its nights in the calendar, like a stay', () => {
  // Closed from the 20th to the 22nd: the nights of the 20th and 21st.
  expect([...blockNights([{ start_date: '2026-10-20', end_date: '2026-10-22' }])].sort()).toEqual([
    '2026-10-20',
    '2026-10-21',
  ])
})
