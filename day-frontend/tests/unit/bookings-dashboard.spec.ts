/**
 * The bookings overview: a month's figures by the stays arriving in it, its nights taken
 * whenever the stay began, the bookings made each day, and what waits on someone now.
 */

import { expect, test } from '@playwright/test'
import {
  byObject,
  bySource,
  madeByDay,
  madeWindow,
  monthFigures,
  nightsOf,
  occupancyByDay,
  stayWindow,
  touched,
  waiting,
} from '../../src/lib/bookings-dashboard'
import type { Booking } from '../../src/types/booking'

let n = 0
const stay = (property_id: string, check_in: string, check_out: string, extra: Partial<Booking> = {}) =>
  ({
    id: `b${++n}`,
    property_id,
    check_in,
    check_out,
    status: 'confirmed',
    source: 'direct',
    rental_mode: 'daily',
    total_price: 30000,
    paid_amount: 0,
    created_at: '2026-11-01T08:00:00',
    ...extra,
  }) as Booking

test('a daily stay sleeps the nights from its arrival to the day before it leaves; an hourly one none', () => {
  expect(nightsOf(stay('a', '2026-11-29T14:00:00', '2026-12-02T12:00:00'))).toEqual(['2026-11-29', '2026-11-30', '2026-12-01'])
  expect(nightsOf(stay('a', '2026-11-19T15:00:00', '2026-11-19T18:00:00', { rental_mode: 'hourly' }))).toEqual([])
})

test("the month's money is its arrivals'; a cancelled stay adds only to the cancellations", () => {
  const stays = [
    stay('a', '2026-11-03T14:00:00', '2026-11-05T12:00:00', { total_price: 40000, paid_amount: 40000 }),
    stay('a', '2026-11-28T14:00:00', '2026-12-03T12:00:00', { total_price: 100000, paid_amount: 20000 }),
    stay('b', '2026-11-10T14:00:00', '2026-11-12T12:00:00', { status: 'cancelled', total_price: 50000 }),
    // Arrived in October: its November nights count in occupancy, its money in October.
    stay('b', '2026-10-30T14:00:00', '2026-11-02T12:00:00', { total_price: 60000 }),
  ]
  const figures = monthFigures(stays, '2026-11', ['a', 'b'])
  expect(figures).toMatchObject({ bookings: 2, booked: 140000, received: 60000, owes: 80000, cancelled: 1 })
  // 2 + 3 nights of a, 1 night of b, over 2 objects × 30 nights.
  expect(figures.occupancy).toBeCloseTo(6 / 60)
  // 140 000 over the 7 nights of the two stays arriving in November.
  expect(figures.nightPrice).toBeCloseTo(20000)
})

test('the average night price leaves out the hourly stays, which sleep no night', () => {
  const stays = [
    stay('a', '2026-11-03T14:00:00', '2026-11-05T12:00:00', { total_price: 40000 }),
    stay('a', '2026-11-07T15:00:00', '2026-11-07T18:00:00', { rental_mode: 'hourly', total_price: 9000 }),
  ]
  expect(monthFigures(stays, '2026-11', ['a']).nightPrice).toBe(20000)
})

test('occupancy counts only the objects asked for, one object once a night however many stays it has', () => {
  const stays = [
    stay('a', '2026-11-01T14:00:00', '2026-11-02T12:00:00'),
    stay('a', '2026-11-01T22:00:00', '2026-11-02T10:00:00'),
    stay('archived', '2026-11-01T14:00:00', '2026-11-03T12:00:00'),
  ]
  const days = occupancyByDay(stays, '2026-11', ['a', 'b'])
  expect(days).toHaveLength(30)
  expect(days.slice(0, 3).map((d) => d.taken)).toEqual([1, 0, 0])
})

test("the bookings made each day are counted by the company's day, cancelled ones too", () => {
  const stays = [
    stay('a', '2027-01-10T14:00:00', '2027-01-12T12:00:00', { created_at: '2026-11-04T20:00:00', total_price: 50000 }),
    stay('a', '2026-11-20T14:00:00', '2026-11-21T12:00:00', { created_at: '2026-11-04T09:00:00', status: 'cancelled' }),
    stay('a', '2026-12-01T14:00:00', '2026-12-02T12:00:00', { created_at: '2026-10-31T21:00:00' }),
  ]
  // A UTC+5 company: 20:00 UTC on the 4th is the 5th, 21:00 on 31 October is 1 November.
  const plus5 = (iso: string) => new Date(Date.parse(`${iso}Z`) + 5 * 3_600_000).toISOString().slice(0, 10)
  const made = madeByDay(stays, '2026-11', plus5).filter((d) => d.count > 0)
  expect(made).toEqual([
    { day: '2026-11-01', count: 1, sum: 30000 },
    { day: '2026-11-04', count: 1, sum: 30000 },
    { day: '2026-11-05', count: 1, sum: 50000 },
  ])
})

test('the server is asked the month and the one before by stay, and a day wider by the day made', () => {
  expect(stayWindow('2026-03')).toEqual({ date_from: '2026-02-01', date_to: '2026-03-31' })
  expect(madeWindow('2026-03')).toEqual({ created_from: '2026-02-28', created_to: '2026-04-01' })
})

test("the sources and the objects come the busiest first; an archived object shows only in a month it had guests", () => {
  const stays = [
    stay('a', '2026-11-03T14:00:00', '2026-11-05T12:00:00', { source: 'booking' }),
    stay('b', '2026-11-03T14:00:00', '2026-11-13T12:00:00'),
    stay('b', '2026-11-20T14:00:00', '2026-11-21T12:00:00'),
    stay('old', '2026-09-03T14:00:00', '2026-09-05T12:00:00'),
  ]
  expect(bySource(stays, '2026-11').map((s) => [s.source, s.count])).toEqual([['direct', 2], ['booking', 1]])
  expect(byObject(stays, '2026-11', ['a', 'b']).map((o) => [o.id, o.nights])).toEqual([['b', 11], ['a', 2]])
  expect([...touched(stays, '2026-11')].sort()).toEqual(['a', 'b'])
  expect([...touched(stays, '2026-09')]).toEqual(['old'])
})

test('what waits now: unconfirmed and owing stays not over yet, arrivals in the next 7 days', () => {
  const today = '2026-11-19'
  const stays = [
    stay('a', '2026-11-10T14:00:00', '2026-11-12T12:00:00', { status: 'pending', total_price: 1 }),
    stay('a', '2026-11-25T14:00:00', '2026-11-27T12:00:00', { status: 'pending', paid_amount: 30000 }),
    stay('a', '2026-11-19T14:00:00', '2026-11-20T12:00:00', { total_price: 10000 }),
    stay('b', '2026-11-26T14:00:00', '2026-11-28T12:00:00', { total_price: 90000 }),
    stay('b', '2026-11-21T14:00:00', '2026-11-22T12:00:00', { status: 'cancelled' }),
  ]
  const waits = waiting(stays, today)
  expect(waits.unconfirmed.map((s) => s.check_in.slice(0, 10))).toEqual(['2026-11-25'])
  expect(waits.owing.map((s) => s.total_price)).toEqual([90000, 10000])
  expect(waits.arriving.map((s) => s.check_in.slice(0, 10))).toEqual(['2026-11-19', '2026-11-25'])
})
