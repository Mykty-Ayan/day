/**
 * The Today screen's first block: a double booking, a guest who owes, a cleaning
 * nobody has taken. A booking stands in several of the day's lists and counts once.
 */

import { expect, test } from '@playwright/test'
import { attentionItems as attentionOn, hourlyStays, occupiedTonight, totalDebt, type AttentionItem } from '../../src/lib/today-attention'
import type { Booking, TodayChecks } from '../../src/types/booking'
import type { CleaningTask } from '../../src/types/cleaning'

const TODAY = '2026-11-02'
const booking = (fields: Partial<Booking>) =>
  ({
    id: 'b',
    status: 'confirmed',
    property_status: 'active',
    total_price: 100,
    paid_amount: 100,
    check_in: '2026-11-02T14:00:00',
    check_out: '2026-11-04T12:00:00',
    ...fields,
  }) as Booking
const task = (fields: Partial<CleaningTask>) =>
  ({ id: 't', status: 'pending', cleaner_id: null, scheduled_date: TODAY, ...fields }) as CleaningTask
const checks = (fields: Partial<TodayChecks>): TodayChecks => ({
  check_ins: [],
  check_outs: [],
  in_house: [],
  ...fields,
})

const attentionItems = (lists: TodayChecks, tasks: CleaningTask[]) => attentionOn(lists, tasks, TODAY)
const cleaningIds = (items: AttentionItem[]) => items.flatMap((item) => (item.kind === 'noCleaner' ? item.tasks.map((t) => t.id) : []))

test('a paid day with an assigned cleaning needs nothing', () => {
  const items = attentionItems(checks({ check_ins: [booking({})] }), [task({ cleaner_id: 'c', status: 'assigned' })])
  expect(items).toEqual([])
})

test('a guest who owes shows the stay and the minibar together', () => {
  const owing = booking({ paid_amount: 60, orders_due: 15 })
  expect(attentionItems(checks({ check_ins: [owing] }), [])).toEqual([
    { kind: 'debt', booking: owing, stage: 'arrives', amount: 55, orders: 15 },
  ])
})

test('a row says where the stay stands today', () => {
  const owing = booking({ paid_amount: 0 })
  const stage = (lists: Partial<TodayChecks>) => attentionItems(checks(lists), [])[0]
  expect(stage({ check_outs: [owing] })).toMatchObject({ stage: 'leaves' })
  expect(stage({ in_house: [owing] })).toMatchObject({ stage: 'staying' })
})

test('a booking in two lists counts once', () => {
  const owing = booking({ paid_amount: 0 })
  expect(attentionItems(checks({ check_outs: [owing], in_house: [owing] }), [])).toHaveLength(1)
})

test('a cancelled booking needs nothing', () => {
  const cancelled = booking({ status: 'cancelled', paid_amount: 0, overbooking: true })
  expect(attentionItems(checks({ check_ins: [cancelled] }), [])).toEqual([])
})

test('a finished or taken cleaning needs nothing, a free one does', () => {
  const items = attentionItems(checks({}), [task({}), task({ id: 'x', status: 'done' }), task({ id: 'y', cleaner_id: 'c' })])
  expect(cleaningIds(items)).toEqual(['t'])
})

test('free cleanings make one row', () => {
  const items = attentionItems(checks({}), [task({ id: 'x' }), task({ id: 'y' })])
  expect(items).toHaveLength(1)
  expect(cleaningIds(items)).toEqual(['x', 'y'])
})

test('the rest goes by the hour: who leaves at noon before who arrives at two, who stays on last', () => {
  const stays = booking({ id: 'stay', paid_amount: 0 })
  const arrives = booking({ id: 'in', paid_amount: 0 })
  const leaves = booking({ id: 'out', paid_amount: 0, check_out: '2026-11-02T12:00:00' })
  const cleaning = task({ scheduled_time: '13:00:00' })
  const items = attentionItems(checks({ check_ins: [arrives], check_outs: [leaves], in_house: [stays] }), [cleaning])
  expect(items.map((item) => ('booking' in item ? item.booking.id : 'cleaning'))).toEqual([
    'out',
    'cleaning',
    'in',
    'stay',
  ])
})

test('a double booking comes first, a free cleaning last', () => {
  const items = attentionItems(
    checks({ check_ins: [booking({ id: 'a', paid_amount: 0 }), booking({ id: 'c', overbooking: true })] }),
    [task({})],
  )
  expect(items.map((item) => item.kind)).toEqual(['overbooking', 'debt', 'noCleaner'])
})

test('tonight counts each flat once, and not the one a guest leaves', () => {
  const arriving = booking({ id: 'a', property_id: 'flat-1' })
  const stayingOn = booking({ id: 'b', property_id: 'flat-2' })
  const sameFlat = booking({ id: 'c', property_id: 'flat-2' })
  const leaving = booking({ id: 'd', property_id: 'flat-3' })
  const cancelled = booking({ id: 'e', property_id: 'flat-4', status: 'cancelled' })
  expect(
    occupiedTonight(checks({ check_ins: [arriving, cancelled, sameFlat], check_outs: [leaving], in_house: [stayingOn] }), TODAY),
  ).toBe(2)
})

test('the debt adds up the guests, not the cleanings', () => {
  const items = attentionItems(
    checks({ check_ins: [booking({ id: 'a', paid_amount: 40 })], in_house: [booking({ id: 'b', paid_amount: 70 })] }),
    [task({})],
  )
  expect(totalDebt(items)).toBe(90)
})

test('hours that end by evening leave the night free, a stay past midnight takes it', () => {
  const daytime = booking({ id: 'a', property_id: 'flat-1', rental_mode: 'hourly', check_out: '2026-11-02T17:00:00' })
  const lateNight = booking({ id: 'b', property_id: 'flat-2', rental_mode: 'hourly', check_in: '2026-11-02T22:00:00', check_out: '2026-11-03T02:00:00' })
  const lists = checks({ check_ins: [daytime, lateNight], check_outs: [daytime] })
  expect(occupiedTonight(lists, TODAY)).toBe(1)
  expect(hourlyStays(lists)).toBe(2)
})

test('a stay leaving today does not hold the night, an hourly guest still inside included', () => {
  const inside = booking({ property_id: 'flat-1', rental_mode: 'hourly', check_in: '2026-11-02T10:00:00', check_out: '2026-11-02T13:00:00' })
  const lastNight = booking({ id: 'b', property_id: 'flat-2', rental_mode: 'hourly', check_in: '2026-11-01T22:00:00', check_out: '2026-11-02T02:00:00' })
  expect(occupiedTonight(checks({ in_house: [inside, lastNight] }), TODAY)).toBe(0)
})

test('only active flats count: that is the total it is read against', () => {
  const lists = checks({ in_house: [booking({ property_status: 'archived' }), booking({ property_status: 'paused' })] })
  expect(occupiedTonight(lists, TODAY)).toBe(0)
})

test('a night after hours in the same flat is still one flat, the hours one stay', () => {
  const hours = booking({ id: 'a', property_id: 'flat-1', rental_mode: 'hourly', check_out: '2026-11-02T13:00:00' })
  const night = booking({ id: 'b', property_id: 'flat-1', rental_mode: 'daily', check_in: '2026-11-02T15:00:00' })
  const lists = checks({ check_ins: [hours, night], check_outs: [hours] })
  expect(occupiedTonight(lists, TODAY)).toBe(1)
  expect(hourlyStays(lists)).toBe(1)
})

test('a guest who left owing is on the list, after today, and in the sum', () => {
  const left = booking({ id: 'old', paid_amount: 30 })
  const arriving = booking({ id: 'new', paid_amount: 90 })
  const items = attentionItems(checks({ check_ins: [arriving], past_debts: [left] }), [])
  expect(items.map((item) => item.kind === 'debt' && [item.booking.id, item.stage])).toEqual([
    ['new', 'arrives'],
    ['old', 'left'],
  ])
  expect(totalDebt(items)).toBe(80)
})

test('a cleaning from a past day goes before everything due today', () => {
  const owing = booking({ paid_amount: 0, check_in: '2026-11-02T00:30:00' })
  const items = attentionItems(checks({ check_ins: [owing] }), [task({ scheduled_date: '2026-10-30' })])
  expect(items.map((item) => item.kind)).toEqual(['noCleaner', 'debt'])
})

test('a cleaning with no date counts as late', () => {
  const [item] = attentionItems(checks({}), [task({ scheduled_date: null })])
  expect(item.kind === 'noCleaner' && item.tasks[0].late).toBe(true)
})

test('a cleaning is due by the next arrival in its flat', () => {
  const owing = booking({ id: 'x', property_id: 'flat-2', paid_amount: 0, check_in: '2026-11-02T14:00:00' })
  const arrival = booking({ id: 'y', property_id: 'flat-1', check_in: '2026-11-02T13:00:00' })
  const items = attentionItems(checks({ check_ins: [owing, arrival] }), [task({ property_id: 'flat-1' })])
  expect(items[0].kind === 'noCleaner' && items[0].tasks[0].arrivesAt).toBe('13:00')
  expect(items.map((item) => item.kind)).toEqual(['noCleaner', 'debt'])
})

test('a cleaner who has not come by the day is on the list, a cleaning due today is not', () => {
  const late = task({ id: 'late', cleaner_id: 'c', status: 'assigned', scheduled_date: '2026-10-30' })
  const started = task({ id: 'started', cleaner_id: 'c', status: 'in_progress', scheduled_date: '2026-10-31' })
  const finished = task({ id: 'x', cleaner_id: 'c', status: 'done', scheduled_date: '2026-10-30' })
  const dueToday = task({ id: 'y', cleaner_id: 'c', status: 'assigned' })
  const items = attentionItems(checks({}), [late, started, finished, dueToday])
  expect(items.map((item) => item.kind === 'lateCleaning' && item.task.id)).toEqual(['late', 'started'])
})

test('a stay nobody closed comes before what is due today', () => {
  const owing = booking({ id: 'x', paid_amount: 0 })
  const forgotten = booking({ id: 'old', status: 'checked_in', check_out: '2026-10-30T12:00:00' })
  const items = attentionItems(checks({ check_ins: [owing], unclosed: [forgotten] }), [])
  expect(items.map((item) => item.kind)).toEqual(['unclosed', 'debt'])
})

test('a double booking long gone is a debt, not a double booking', () => {
  const left = booking({ overbooking: true, paid_amount: 0 })
  expect(attentionItems(checks({ past_debts: [left] }), []).map((item) => item.kind)).toEqual(['debt'])
})

test('a guest never marked in still owes, and is not called a double booking', () => {
  const unmarked = booking({ overbooking: true, paid_amount: 40, check_in: '2026-11-01T14:00:00' })
  const items = attentionItems(checks({ unclosed: [unmarked] }), [])
  expect(items.map((item) => item.kind)).toEqual(['unclosed', 'debt'])
  expect(totalDebt(items)).toBe(60)
  expect(items[1].kind === 'debt' && items[1].stage).toBe('notArrived')
})
