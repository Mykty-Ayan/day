/** What the Today screen puts first: what someone has to deal with today. */

import { rowDebt } from '../pages/miniapp/money'
import type { Booking, TodayChecks } from '../types/booking'
import type { CleaningTask } from '../types/cleaning'

const day = (value: string) => value.slice(0, 10)
const live = (bookings: Booking[]) => bookings.filter((booking) => booking.status !== 'cancelled')

/** Flats with someone in them tonight, each flat once: a stay counts by whether it
 *  runs past today's midnight, not by how it was sold. Hours that end by evening
 *  leave the flat free for the night, and a 22:00-02:00 stay takes it. Only active
 *  flats: that is the total this is read against. */
export function occupiedTonight(checks: TodayChecks, today: string): number {
  const tonight = live([...checks.check_ins, ...checks.in_house]).filter(
    (booking) => day(booking.check_out) > today && booking.property_status === 'active',
  )
  return new Set(tonight.map((booking) => booking.property_id)).size
}

/** Stays sold by the hour on today's lists. They are counted apart from the nights,
 *  as hotels count day use: one flat can take several in a day. */
export function hourlyStays(checks: TodayChecks): number {
  const stays = live([...checks.check_ins, ...checks.check_outs, ...checks.in_house])
  return new Set(stays.filter((booking) => booking.rental_mode === 'hourly').map((booking) => booking.id)).size
}

/** What guests still owe: today's and those who left owing. */
export function totalDebt(items: AttentionItem[]): number {
  return items.reduce((total, item) => total + (item.kind === 'debt' ? item.amount : 0), 0)
}

export type StayStage = 'arrives' | 'leaves' | 'staying' | 'left' | 'notArrived'

/** A cleaning nobody has taken, and the arrival in its flat that it has to beat. */
export type FreeCleaning = CleaningTask & { arrivesAt?: string; late: boolean }

export type AttentionItem =
  | { kind: 'overbooking'; booking: Booking; stage: StayStage }
  | { kind: 'debt'; booking: Booking; stage: StayStage; amount: number; orders: number }
  | { kind: 'noCleaner'; tasks: FreeCleaning[] }
  | { kind: 'lateCleaning'; task: CleaningTask }
  | { kind: 'unclosed'; booking: Booking }

const clock = (value: string | null | undefined) => value?.slice(11, 16) ?? ''
// Sorted as text: after any time of day.
const SOME_TIME_TODAY = '98'
const NOT_TODAY = '99'
const OVERDUE = '00'

/** When today this has to be dealt with. */
function dueAt(item: AttentionItem): string {
  if (item.kind === 'lateCleaning' || item.kind === 'unclosed') return OVERDUE
  if (item.kind === 'noCleaner') {
    if (item.tasks.some((task) => task.late)) return OVERDUE
    const times = item.tasks.flatMap((task) => [task.arrivesAt, task.scheduled_time?.slice(0, 5)].filter((time) => time != null))
    return times.sort()[0] ?? SOME_TIME_TODAY
  }
  if (item.stage === 'leaves') return clock(item.booking.check_out)
  if (item.stage === 'arrives') return clock(item.booking.check_in)
  return NOT_TODAY
}

/** A double booking first, the rest by the hour it comes due: what is overdue from a
 *  past day at once, a cleaning before an arrival by that arrival, old debts last. A booking stands
 *  in several of today's lists and counts once; free cleanings make one row. */
export function attentionItems(checks: TodayChecks, tasks: CleaningTask[], today: string): AttentionItem[] {
  const listed = [
    ...checks.check_ins.map((booking) => ({ booking, stage: 'arrives' as const })),
    ...checks.check_outs.map((booking) => ({ booking, stage: 'leaves' as const })),
    ...checks.in_house.map((booking) => ({ booking, stage: 'staying' as const })),
    ...(checks.unclosed ?? []).map((booking) => ({
      booking,
      stage: booking.status === 'checked_in' ? ('left' as const) : ('notArrived' as const),
    })),
    ...(checks.past_debts ?? []).map((booking) => ({ booking, stage: 'left' as const })),
  ].filter(({ booking }) => booking.status !== 'cancelled')
  const stays = listed.filter(({ booking }, index) => listed.findIndex((stay) => stay.booking.id === booking.id) === index)

  const overbooked = stays.filter(({ booking, stage }) => booking.overbooking && !['left', 'notArrived'].includes(stage))
  const owing = stays.flatMap((stay) => {
    const debt = rowDebt(stay.booking)
    return debt ? [{ ...stay, amount: debt.total, orders: debt.orders }] : []
  })
  const unassigned = tasks
    .filter((task) => task.status === 'pending' && !task.cleaner_id)
    .map((task) => ({
      ...task,
      late: !task.scheduled_date || task.scheduled_date < today,
      arrivesAt: live(checks.check_ins)
        .filter((booking) => booking.property_id === task.property_id)
        .map((booking) => clock(booking.check_in))
        .sort()[0],
    }))

  const late = tasks.filter(
    (task) =>
      task.cleaner_id && !['done', 'verified'].includes(task.status) && task.scheduled_date && task.scheduled_date < today,
  )

  const timed: AttentionItem[] = [
    ...live(checks.unclosed ?? []).map((booking) => ({ kind: 'unclosed' as const, booking })),
    ...late.map((task) => ({ kind: 'lateCleaning' as const, task })),
    ...owing.map((item) => ({ kind: 'debt' as const, ...item })),
    ...(unassigned.length > 0 ? [{ kind: 'noCleaner' as const, tasks: unassigned }] : []),
  ]
  return [
    ...overbooked.map((stay) => ({ kind: 'overbooking' as const, ...stay })),
    ...timed.sort((a, b) => dueAt(a).localeCompare(dueAt(b))),
  ]
}
