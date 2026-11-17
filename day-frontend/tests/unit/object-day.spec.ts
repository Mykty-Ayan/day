/**
 * The objects list as a board for today: each object's day from midnight to midnight,
 * the day's counters, and what an object lacks to be sold.
 */

import { expect, test } from '@playwright/test'
import { dayCounts, daySegments, inCount, objectDay, objectProblems } from '../../src/lib/object-day'
import type { Booking, GanttBlock } from '../../src/types/booking'
import type { CleaningTask } from '../../src/types/cleaning'
import type { PricingBase, Property, PropertySetup } from '../../src/types/property'

const NOW = '2026-11-18T13:20:00'

const stay = (id: string, check_in: string, check_out: string, status = 'confirmed', rental_mode = 'daily') =>
  ({ id, check_in, check_out, status, rental_mode, guest_name: id }) as Booking

const block = (id: string, start_date: string, end_date: string, starts_at?: string, ends_at?: string) =>
  ({ id, start_date, end_date, reason: null, starts_at, ends_at }) as GanttBlock

const task = (status: string, scheduled_date: string | null) => ({ status, scheduled_date }) as CleaningTask

const spans = (stays: Booking[], blocks: GanttBlock[] = [], now = NOW) =>
  daySegments(stays, blocks, now).map((s) => [s.id, s.from, s.to, s.tone])

test("a night's stay is drawn from midnight to its check-out, the next from its check-in to midnight", () => {
  const stays = [
    stay('leaving', '2026-11-15T14:00:00', '2026-11-18T12:00:00', 'checked_in'),
    stay('coming', '2026-11-18T14:00:00', '2026-11-20T12:00:00'),
  ]
  // In the morning, before the check-out.
  expect(spans(stays, [], '2026-11-18T10:00:00')).toEqual([
    ['leaving', 0, 720, 'in'],
    ['coming', 840, 1440, 'booked'],
  ])
})

test('hourly stays are drawn by their hours; a stay not confirmed yet is drawn apart', () => {
  const stays = [
    stay('evening', '2026-11-18T17:00:00', '2026-11-18T20:00:00', 'pending', 'hourly'),
    stay('noon', '2026-11-18T12:00:00', '2026-11-18T15:00:00', 'checked_in', 'hourly'),
  ]
  expect(spans(stays)).toEqual([
    ['noon', 720, 900, 'in'],
    ['evening', 1020, 1200, 'pending'],
  ])
})

test('a cancelled stay or one of another day is not drawn', () => {
  const stays = [
    stay('off', '2026-11-18T14:00:00', '2026-11-19T12:00:00', 'cancelled'),
    stay('tomorrow', '2026-11-19T14:00:00', '2026-11-20T12:00:00'),
    stay('yesterday', '2026-11-16T14:00:00', '2026-11-17T12:00:00', 'completed'),
  ]
  expect(spans(stays)).toEqual([])
})

test('a guest who has left is drawn only up to now, and one who left on an earlier day not at all', () => {
  const stays = [
    // Due out at 15:00 but already marked out: the bar shows where the guest was, not more.
    stay('left', '2026-11-16T14:00:00', '2026-11-18T15:00:00', 'checked_out'),
    // Due out tomorrow but already out: left on some earlier day, when is not known.
    stay('early', '2026-11-15T14:00:00', '2026-11-19T12:00:00', 'completed'),
  ]
  expect(spans(stays)).toEqual([['left', 0, 800, 'gone']])
  expect(spans(stays, [], '2026-11-18T16:00:00')).toEqual([['left', 0, 900, 'gone']])
})

test('closed dates are drawn for the whole day, or by their hours on their first and last day', () => {
  const blocks = [
    block('all-day', '2026-11-17', '2026-11-20'),
    // Ends today at the check-out hour: its end date is today, and it still held the morning.
    block('till-noon', '2026-11-16', '2026-11-18', '2026-11-16T12:00:00', '2026-11-18T12:00:00'),
    block('from-noon', '2026-11-18', '2026-11-20', '2026-11-18T12:00:00', '2026-11-20T12:00:00'),
    block('later', '2026-11-19', '2026-11-21'),
    block('before', '2026-11-15', '2026-11-18'),
  ]
  expect(spans([], blocks)).toEqual([
    ['all-day', 0, 1440, 'closed'],
    ['till-noon', 0, 720, 'closed'],
    ['from-noon', 720, 1440, 'closed'],
  ])
})

test('a guest still marked in after the check-out is in: drawn up to now, and the object is not free', () => {
  const kept = stay('kept', '2026-11-14T14:00:00', '2026-11-17T12:00:00', 'checked_in')
  expect(spans([kept])).toEqual([['kept', 0, 800, 'in']])
  const day = objectDay([kept], [], [], NOW)
  expect(day.current?.id).toBe('kept')
  expect(inCount(day, 'free')).toBe(false)
})

test('an object held by closed dates now is not free; one closed until this morning is', () => {
  const repairs = objectDay([], [block('repairs', '2026-11-17', '2026-11-20')], [], NOW)
  expect(repairs.closed).toBe(true)
  expect(inCount(repairs, 'free')).toBe(false)
  const reopened = objectDay([], [block('done', '2026-11-16', '2026-11-18', '2026-11-16T12:00:00', '2026-11-18T12:00:00')], [], NOW)
  expect(reopened.closed).toBe(false)
  expect(inCount(reopened, 'free')).toBe(true)
})

test("an object's day: who is in, who is next, today's arrivals and departures, a cleaning due", () => {
  const stays = [
    stay('out', '2026-11-16T14:00:00', '2026-11-18T12:00:00', 'checked_out'),
    stay('noon', '2026-11-18T12:00:00', '2026-11-18T15:00:00', 'checked_in', 'hourly'),
    stay('evening', '2026-11-18T17:00:00', '2026-11-18T20:00:00', 'confirmed', 'hourly'),
    stay('off', '2026-11-18T21:00:00', '2026-11-18T23:00:00', 'cancelled', 'hourly'),
  ]
  const day = objectDay(stays, [], [task('done', '2026-11-18'), task('assigned', '2026-11-02')], NOW)
  expect(day.current?.id).toBe('noon')
  expect(day.next?.id).toBe('evening')
  expect(day.arrivals.map((s) => s.id)).toEqual(['noon', 'evening'])
  expect(day.departures.map((s) => s.id)).toEqual(['out', 'noon', 'evening'])
  // A cleaning left open from an earlier day is still due.
  expect(day.cleaning).toBe(true)
})

test('a cleaning done, or planned for a later day, is not due today; one with no day is', () => {
  const due = (tasks: CleaningTask[]) => objectDay([], [], tasks, NOW).cleaning
  expect(due([task('done', '2026-11-18'), task('verified', '2026-11-17')])).toBe(false)
  expect(due([task('pending', '2026-11-19')])).toBe(false)
  expect(due([task('pending', null)])).toBe(true)
})

test('the counters: arrivals and departures count stays, the rest count objects', () => {
  const busy = objectDay(
    [
      stay('noon', '2026-11-18T12:00:00', '2026-11-18T15:00:00', 'checked_in', 'hourly'),
      stay('evening', '2026-11-18T17:00:00', '2026-11-18T20:00:00', 'confirmed', 'hourly'),
    ],
    [],
    [],
    NOW,
  )
  const dirty = objectDay([stay('out', '2026-11-16T14:00:00', '2026-11-18T12:00:00', 'checked_out')], [], [task('pending', null)], NOW)
  const empty = objectDay([], [], [], NOW)

  expect(dayCounts([busy, dirty, empty])).toEqual({ arrivals: 2, departures: 3, living: 1, cleaning: 1, free: 1 })
  // An object waiting for a cleaning is not free yet.
  expect([busy, dirty, empty].map((day) => inCount(day, 'free'))).toEqual([false, false, true])
})

const object = (fields: Partial<Property> = {}) =>
  ({
    rental_mode: 'daily',
    photos: [{ audience: 'public' }, { audience: 'public' }, { audience: 'public' }],
    check_in_instructions: 'Code 1234',
    ...fields,
  }) as unknown as Property

const setup = (pricing: Partial<PricingBase> | null, calendar_error = false) =>
  ({ property_id: 'p', pricing, calendar_error }) as PropertySetup

test('an object with prices, three photos and how to get in lacks nothing', () => {
  expect(objectProblems(object(), setup({ base_price: 20000 }))).toEqual([])
})

test('an object lacks prices for the way it is rented', () => {
  expect(objectProblems(object(), setup(null))).toEqual(['noPrices'])
  expect(objectProblems(object(), setup({ base_price: 0 }))).toEqual(['noPrices'])
  // Rented by the hour, a nightly price alone does not sell it.
  expect(objectProblems(object({ rental_mode: 'hourly' }), setup({ base_price: 20000 }))).toEqual(['noPrices'])
  expect(objectProblems(object({ rental_mode: 'hourly' }), setup({ price_3h: 9000 }))).toEqual([])
})

test('photos for getting in do not count as photos of the object', () => {
  const few = object({ photos: [{ audience: 'public' }, { audience: 'guest' }, { audience: 'guest' }] as Property['photos'] })
  expect(objectProblems(few, setup({ base_price: 1 }))).toEqual(['fewPhotos'])
  expect(objectProblems(object({ photos: [] }), setup({ base_price: 1 }))).toEqual(['noPhotos'])
})

test('no way in written, a calendar that fails, and nothing said of prices while they load', () => {
  const bare = object({ check_in_instructions: '  ' })
  expect(objectProblems(bare, setup({ base_price: 1 }, true))).toEqual(['noCheckIn', 'calendar'])
  expect(objectProblems(object(), undefined)).toEqual([])
})
