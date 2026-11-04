/** The chessboard's lanes and night prices. */

import { expect, test } from '@playwright/test'
import { assignLanes, barDays, barSpan, barTone, dayNumber, freeWindows, busyOn, byCompanyOrder, hoursOn, nightlyRate, nightRuns, nightsBetween, owes, rowLayout, toReturn } from '../../src/lib/chessboard'
import type { PricingConfig } from '../../src/types/property'

const stay = (id: string, check_in: string, check_out: string, rental_mode = 'daily') => ({ id, check_in, check_out, rental_mode })
const hourly = (id: string, check_in: string, check_out: string) => stay(id, check_in, check_out, 'hourly')

test('a stay by the night takes the cells of its nights, whatever the hours', () => {
  const day = dayNumber('2026-11-06')
  expect(barSpan(stay('a', '2026-11-06T14:00:00', '2026-11-09T12:00:00'))).toEqual({ start: day, end: day + 3 })
  expect(barSpan(stay('b', '2026-11-06T18:00:00', '2026-11-09T10:00:00'))).toEqual({ start: day, end: day + 3 })
  expect(barSpan(hourly('h', '2026-11-06T13:00:00', '2026-11-06T16:00:00'))).toEqual({ start: day, end: day + 1 })
})

test('a stay covers its nights, and hours within one day take that day', () => {
  expect(barDays('2026-11-06T14:00:00', '2026-11-09T12:00:00')).toEqual({ start: '2026-11-06', end: '2026-11-09' })
  expect(barDays('2026-11-11T13:00:00', '2026-11-11T16:00:00')).toEqual({ start: '2026-11-11', end: '2026-11-12' })
  expect(barDays('2026-11-30T21:00:00', '2026-12-01T02:00:00')).toEqual({ start: '2026-11-30', end: '2026-12-01' })
})

test('two hourly stays on one day go one under the other', () => {
  const { lane, count } = assignLanes([
    hourly('b', '2026-11-11T18:00:00', '2026-11-11T21:00:00'),
    hourly('a', '2026-11-11T13:00:00', '2026-11-11T16:00:00'),
  ])
  expect(count).toBe(2)
  expect(lane.get('a')).toBe(0)
  expect(lane.get('b')).toBe(1)
})

test('a guest leaving at 12:00 and the next arriving at 14:00 share a lane', () => {
  const { lane, count } = assignLanes([
    stay('a', '2026-11-04T14:00:00', '2026-11-07T12:00:00'),
    stay('b', '2026-11-07T14:00:00', '2026-11-10T12:00:00'),
    hourly('h', '2026-11-11T15:00:00', '2026-11-11T18:00:00'),
  ])
  expect(count).toBe(1)
  expect([...lane.values()]).toEqual([0, 0, 0])
})

test('hours on a check-out day share the lane; hours on a check-in day go under the stay', () => {
  const leaving = assignLanes([
    stay('a', '2026-11-04T14:00:00', '2026-11-07T12:00:00'),
    hourly('h', '2026-11-07T15:00:00', '2026-11-07T18:00:00'),
  ])
  expect(leaving.count).toBe(1)
  const arriving = assignLanes([
    stay('a', '2026-11-04T14:00:00', '2026-11-07T12:00:00'),
    hourly('h', '2026-11-04T10:00:00', '2026-11-04T13:00:00'),
  ])
  expect(arriving.count).toBe(2)
  expect(arriving.lane.get('h')).toBe(1)
})

test('a stay sold twice takes a second lane, and a later one goes back to the first', () => {
  const { lane, count } = assignLanes([
    stay('a', '2026-11-04T14:00:00', '2026-11-08T12:00:00'),
    stay('b', '2026-11-06T14:00:00', '2026-11-09T12:00:00'),
    stay('c', '2026-11-08T14:00:00', '2026-11-10T12:00:00'),
  ])
  expect(count).toBe(2)
  expect(lane.get('b')).toBe(1)
  expect(lane.get('c')).toBe(0)
})

test('a row with no stays has one lane', () => {
  expect(assignLanes([]).count).toBe(1)
})

const pricing = {
  base_price: 21000,
  weekend_markup: 3000,
  seasonal_prices: [{ start_date: '2026-12-15', end_date: '2026-12-17', price: 27000 }],
} as unknown as PricingConfig

test('a night costs the base price, Friday and Saturday with the markup', () => {
  expect(nightlyRate(pricing, '2026-11-05')).toBe(21000) // Thursday
  expect(nightlyRate(pricing, '2026-11-06')).toBe(24000) // Friday
  expect(nightlyRate(pricing, '2026-11-07')).toBe(24000) // Saturday
  expect(nightlyRate(pricing, '2026-11-08')).toBe(21000) // Sunday
})

test('a season replaces the base price, and a calendar price replaces both', () => {
  expect(nightlyRate(pricing, '2026-12-16')).toBe(27000)
  expect(nightlyRate(pricing, '2026-12-16', 30000)).toBe(30000)
  expect(nightlyRate(null, '2026-12-16')).toBeNull()
})

const NOW = '2026-11-03T15:00:00'
const at = (status: string, check_in: string, check_out: string) => ({ status, check_in, check_out })

test('a bar says where the stay is', () => {
  expect(barTone(at('confirmed', '2026-11-06T14:00:00', '2026-11-09T12:00:00'), NOW)).toBe('confirmed')
  expect(barTone(at('pending', '2026-11-03T14:00:00', '2026-11-05T12:00:00'), NOW)).toBe('pending')
  expect(barTone(at('checked_in', '2026-11-02T14:00:00', '2026-11-04T12:00:00'), NOW)).toBe('inHouse')
  expect(barTone(at('completed', '2026-11-01T14:00:00', '2026-11-02T12:00:00'), NOW)).toBe('done')
  expect(barTone(at('cancelled', '2026-11-06T14:00:00', '2026-11-09T12:00:00'), NOW)).toBe('cancelled')
})

test('a guest past check-out, or not come by the end of the arrival day, is late', () => {
  expect(barTone(at('checked_in', '2026-11-01T14:00:00', '2026-11-03T12:00:00'), NOW)).toBe('late')
  expect(barTone(at('confirmed', '2026-11-02T14:00:00', '2026-11-05T12:00:00'), NOW)).toBe('late')
  // Arriving today: still on time all day.
  expect(barTone(at('confirmed', '2026-11-03T14:00:00', '2026-11-05T12:00:00'), NOW)).toBe('confirmed')
})

test('a stay by the hour is late once its hours have begun and no one came', () => {
  const hours = (status: string, from: string, to: string) => ({ ...at(status, `2026-11-03T${from}:00`, `2026-11-03T${to}:00`), rental_mode: 'hourly' })
  // NOW is 15:00: 10–13 is over, 14–17 has begun, 18–21 is still to come.
  expect(barTone(hours('confirmed', '10:00', '13:00'), NOW)).toBe('late')
  expect(barTone(hours('pending', '14:00', '17:00'), NOW)).toBe('late')
  expect(barTone(hours('confirmed', '18:00', '21:00'), NOW)).toBe('confirmed')
  expect(barTone(hours('checked_in', '14:00', '17:00'), NOW)).toBe('inHouse')
})

test('paid over the price is to give back; on a cancelled stay, all that was paid', () => {
  // Three nights paid, then cut to one.
  expect(toReturn({ status: 'confirmed', total_price: 22000, paid_amount: 69000 })).toBe(47000)
  expect(toReturn({ status: 'confirmed', total_price: 22000, paid_amount: 10000 })).toBe(0)
  expect(toReturn({ status: 'cancelled', total_price: 22000, paid_amount: 10000 })).toBe(10000)
})

test('a debt is the price less what was paid, and none on a cancelled stay', () => {
  expect(owes({ status: 'confirmed', total_price: 69000, paid_amount: 23000 })).toBe(46000)
  expect(owes({ status: 'checked_in', total_price: 200, paid_amount: 1200 })).toBe(0)
  expect(owes({ status: 'cancelled', total_price: 69000, paid_amount: 0 })).toBe(0)
})

test('nights between two days include both, across a month', () => {
  expect(nightsBetween('2026-11-29', '2026-12-01')).toEqual(['2026-11-29', '2026-11-30', '2026-12-01'])
  expect(nightsBetween('2026-11-29', '2026-11-29')).toEqual(['2026-11-29'])
})

const hour = (id: string, from: string, to: string, status = 'confirmed') => ({
  id, check_in: `2026-11-03T${from}:00`, check_out: `2026-11-03T${to}:00`, rental_mode: 'hourly', status,
})

test('a day by the hour lists its stays by the start, as minutes of the day', () => {
  const parts = hoursOn([hour('b', '16:00', '19:00'), hour('a', '11:00', '14:00'), hour('c', '20:00', '23:00', 'cancelled')], '2026-11-03')
  expect(parts.map((part) => [part.stay.id, part.from, part.to])).toEqual([['a', 660, 840], ['b', 960, 1140]])
})

test('a stay over midnight takes the end of one day and the start of the next', () => {
  const late = { id: 'n', check_in: '2026-11-03T22:00:00', check_out: '2026-11-04T02:00:00', rental_mode: 'hourly', status: 'confirmed' }
  expect(hoursOn([late], '2026-11-03').map((p) => [p.from, p.to])).toEqual([[1320, 1440]])
  expect(hoursOn([late], '2026-11-04').map((p) => [p.from, p.to])).toEqual([[0, 120]])
  expect(freeWindows([late], '2026-11-04')).toEqual([{ from: '02:00', to: '24:00', hours: 22 }])
})

test('free windows lie between the stays, an hour or longer', () => {
  const stays = [hour('a', '11:00', '14:00'), hour('b', '14:30', '16:00'), hour('c', '16:00', '19:00')]
  expect(freeWindows(stays, '2026-11-03')).toEqual([
    { from: '00:00', to: '11:00', hours: 11 },
    { from: '19:00', to: '24:00', hours: 5 },
  ])
})

test("today's free windows start from the next whole hour; a past day has none", () => {
  const stays = [hour('a', '16:00', '19:00')]
  expect(freeWindows(stays, '2026-11-03', '2026-11-03T13:20:00')).toEqual([
    { from: '14:00', to: '16:00', hours: 2 },
    { from: '19:00', to: '24:00', hours: 5 },
  ])
  expect(freeWindows(stays, '2026-11-03', '2026-11-04T09:00:00')).toEqual([])
})

test('picked nights break into runs, one range each', () => {
  // 16–22 Nov 2026, Friday and Saturday only: 20 and 21.
  expect(nightRuns(['2026-11-21', '2026-11-20'])).toEqual([{ start_date: '2026-11-20', end_date: '2026-11-22' }])
  // Weekdays of 16–22 Nov, then Monday 23: two runs.
  expect(nightRuns(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-23'])).toEqual([
    { start_date: '2026-11-16', end_date: '2026-11-20' },
    { start_date: '2026-11-23', end_date: '2026-11-24' },
  ])
  expect(nightRuns([])).toEqual([])
})

const st = (id: string, check_in: string, check_out: string, rental_mode = 'daily', status = 'confirmed') => ({ id, check_in, check_out, rental_mode, status })

test('hours on the check-in morning of a longer stay sit inside its bar, on its lane', () => {
  const row = rowLayout([
    st('m', '2026-11-04T14:00:00', '2026-11-07T12:00:00'),
    st('h', '2026-11-04T10:00:00', '2026-11-04T13:00:00', 'hourly'),
  ])
  expect(row.inside.get('m')).toBe('2026-11-04')
  expect(row.lane.get('h:2026-11-04')).toBe(row.lane.get('m'))
  expect(row.count).toBe(1)
  expect(row.clocks.size).toBe(0)
})

test('a one-night stay with hours on its morning carries a clock: the day has no cell of its own', () => {
  const row = rowLayout([
    st('m', '2026-11-04T14:00:00', '2026-11-05T12:00:00'),
    st('h1', '2026-11-04T06:00:00', '2026-11-04T09:00:00', 'hourly'),
    st('h2', '2026-11-04T10:00:00', '2026-11-04T13:00:00', 'hourly'),
  ])
  expect([...row.clocks]).toEqual(['m'])
  expect(row.days).toEqual([])
  expect(row.count).toBe(1)
})

test('hours on a check-out day get their own cell on the same lane', () => {
  const row = rowLayout([
    st('m', '2026-11-04T14:00:00', '2026-11-07T12:00:00'),
    st('h', '2026-11-07T15:00:00', '2026-11-07T18:00:00', 'hourly'),
  ])
  expect(row.days).toEqual(['2026-11-07'])
  expect(row.inside.size).toBe(0)
  expect(row.count).toBe(1)
})

test('a cancelled stay takes no hours inside it and carries no clock', () => {
  const row = rowLayout([
    st('m', '2026-11-04T14:00:00', '2026-11-05T12:00:00', 'daily', 'cancelled'),
    st('h', '2026-11-04T10:00:00', '2026-11-04T13:00:00', 'hourly'),
  ])
  expect(row.clocks.size).toBe(0)
  expect(row.days).toEqual(['2026-11-04'])
})

test('hours in the morning do not take the night that starts at 14:00, hours on the way out do', () => {
  const row = {
    bookings: [
      { status: 'confirmed', check_in: '2026-11-06T10:00:00', check_out: '2026-11-06T13:00:00' },
      { status: 'confirmed', check_in: '2026-11-08T10:00:00', check_out: '2026-11-08T11:00:00' },
    ],
  }
  // The night of the 6th, out on the 7th: the 6th's morning hours are over by then.
  expect(busyOn(row, '2026-11-06', '2026-11-06').bookings).toHaveLength(0)
  // Out on the 8th at noon: the 8th's 10–11 is still the guest's.
  expect(busyOn(row, '2026-11-07', '2026-11-07').bookings).toHaveLength(1)
  // A stay by bare dates is in at 14:00 and out at 12:00: the night before it is free.
  const dates = { bookings: [{ status: 'confirmed', check_in: '2026-11-10', check_out: '2026-11-12' }] }
  expect(busyOn(dates, '2026-11-09', '2026-11-09').bookings).toHaveLength(0)
  expect(busyOn(dates, '2026-11-11', '2026-11-11').bookings).toHaveLength(1)
  expect(busyOn(dates, '2026-11-12', '2026-11-12').bookings).toHaveLength(0)
})

test('free hours leave out a closed time, from the check-out hour of its first day', () => {
  const closed = [{ start_date: '2026-11-03', end_date: '2026-11-05' }]
  expect(freeWindows([hour('a', '09:00', '11:00')], '2026-11-03', undefined, closed)).toEqual([
    { from: '00:00', to: '09:00', hours: 9 },
    { from: '11:00', to: '12:00', hours: 1 },
  ])
  expect(freeWindows([], '2026-11-04', undefined, closed)).toEqual([])
  expect(freeWindows([], '2026-11-05', undefined, closed)).toEqual([{ from: '12:00', to: '24:00', hours: 12 }])
})

test("flats go in the company's order, the rest after them by name", () => {
  const row = (internal_name: string, position: number | null) => ({ property: { internal_name, position } })
  const rows = [row('Кв. 12', null), row('Студия 7', 0), row('Кв. 15', 1), row('Кв. 10', null)]
  expect(byCompanyOrder(rows).map((r) => r.property.internal_name)).toEqual(['Студия 7', 'Кв. 15', 'Кв. 10', 'Кв. 12'])
})
