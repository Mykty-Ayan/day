/** What the chessboard draws: which days a bar covers, which lane it takes, a night's price. */

import type { PricingConfig } from '../types/property'

/** yyyy-mm-dd of a date or a date-time. */
export const dayOf = (value: string) => value.slice(0, 10)

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d + n)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** The days a bar covers, [start, end): a stay ends on its check-out morning, and a few
 *  hours within one day still take that whole day. */
export function barDays(checkIn: string, checkOut: string): { start: string; end: string } {
  const start = dayOf(checkIn)
  const end = dayOf(checkOut)
  return { start, end: end > start ? end : addDays(start, 1) }
}

interface Stay {
  id: string
  check_in: string
  check_out: string
  rental_mode?: string
}

/** Days from 1970-01-01 to a yyyy-mm-dd: the grid's x axis. */
export function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86400000
}

// The hour of a date-time as a share of the day; a bare date is its midnight.
const dayShare = (value: string) =>
  value.length > 10 ? (Number(value.slice(11, 13)) + Number(value.slice(14, 16)) / 60) / 24 : 0

/** Where a bar lies on the x axis, in days: a stay by the night takes the cells of its
 *  nights, whatever the hours, so stays of as many nights are as long and a night's cell
 *  is its price's. The check-out day stays free for hours or the next guest; the hours
 *  are in the booking's panel. Hours take their whole days. */
export function barSpan(stay: Stay): { start: number; end: number } {
  const { start, end } = barDays(stay.check_in, stay.check_out)
  return { start: dayNumber(start), end: dayNumber(end) }
}

/** One lane per bar: a bar goes on the first lane where it overlaps no other, so two
 *  hourly stays on one day, or two stays sold twice, sit one under the other.
 *  Greedy by the start: the fewest lanes for intervals. */
export function assignLanes(stays: Stay[]): { lane: Map<string, number>; count: number } {
  const lane = new Map<string, number>()
  const laneEnds: number[] = []
  const spans = stays.map((stay) => ({ id: stay.id, ...barSpan(stay) }))
  spans.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
  for (const span of spans) {
    let free = laneEnds.findIndex((laneEnd) => laneEnd <= span.start)
    if (free < 0) free = laneEnds.length
    laneEnds[free] = span.end
    lane.set(span.id, free)
  }
  return { lane, count: Math.max(1, laneEnds.length) }
}

export type BarTone = 'late' | 'inHouse' | 'confirmed' | 'pending' | 'done' | 'cancelled'

/** A bar's colour says whether it needs a hand, as on Mews' timeline: a guest who should
 *  have come or gone by now is late; the rest by where the stay is. */
export function barTone(stay: { status: string; check_in: string; check_out: string; rental_mode?: string }, now: string): BarTone {
  if (stay.status === 'cancelled') return 'cancelled'
  if (stay.status === 'checked_out' || stay.status === 'completed') return 'done'
  if (stay.status === 'checked_in') return stay.check_out < now ? 'late' : 'inHouse'
  // Not come by the end of the arrival day; for a few hours, by their start.
  if (stay.rental_mode === 'hourly' ? stay.check_in.slice(0, 16) <= now.slice(0, 16) : dayOf(stay.check_in) < dayOf(now)) return 'late'
  return stay.status === 'pending' ? 'pending' : 'confirmed'
}

/** What the guest still owes; a cancelled stay owes nothing here. */
export function owes(stay: { status: string; total_price: number; paid_amount?: number }): number {
  if (stay.status === 'cancelled') return 0
  return Math.max(0, Number(stay.total_price) - Number(stay.paid_amount ?? 0))
}

/** The nights the weekend markup goes on, by Date.getDay(): Friday's and Saturday's,
 *  as the server counts them (price_calculator). One place, so a company's own choice
 *  of weekend can replace it. */
export const WEEKEND_NIGHTS: readonly number[] = [5, 6]

/** What came in over the price, to give back; on a cancelled stay all that came in,
 *  as bookingMoney counts it. */
export function toReturn(stay: { status: string; total_price: number; paid_amount?: number }): number {
  const paid = Number(stay.paid_amount ?? 0)
  return stay.status === 'cancelled' ? Math.max(0, paid) : Math.max(0, paid - Number(stay.total_price))
}

/** A night's usual price, as the server counts it: the season's or the base one, and the
 *  weekend markup on Friday and Saturday nights. A price set on the calendar comes first. */
export function nightlyRate(pricing: PricingConfig | null | undefined, day: string, custom?: number): number | null {
  if (custom !== undefined) return custom
  if (!pricing) return null
  const season = pricing.seasonal_prices.find((s) => s.start_date <= day && day <= s.end_date)
  const [y, m, d] = day.split('-').map(Number)
  const weekday = new Date(y, m - 1, d).getDay()
  const weekend = WEEKEND_NIGHTS.includes(weekday) && pricing.weekend_markup > 0 ? pricing.weekend_markup : 0
  return (season ? season.price : pricing.base_price) + weekend
}

/** The nights from first to last, both included. */
export function nightsBetween(first: string, last: string): string[] {
  const nights: string[] = []
  for (let day = first; day <= last; day = addDays(day, 1)) nights.push(day)
  return nights
}

/** A flat's stays and closed nights that take any of the picked nights, first to last.
 *  A stay counts by its hours against the nights' own, from 14:00 of the first to
 *  12:00 after the last (the server's defaults): hours in the morning before the first
 *  night leave it free. The server checks the flat's own hours. A cancelled or
 *  completed stay holds no night, as the server counts it. */
export function busyOn<B extends { status: string; check_in: string; check_out: string }, C extends { start_date: string; end_date: string }>(
  row: { bookings: B[]; blocks?: C[] },
  first: string,
  last: string,
): { bookings: B[]; blocks: C[] } {
  const after = addDays(last, 1)
  // A bare date is the server's default hour: in at 14:00, out at 12:00.
  const at = (value: string, hour: string) => (value.length > 10 ? value.slice(0, 19) : `${value}T${hour}`)
  const [from, to] = [`${first}T14:00:00`, `${after}T12:00:00`]
  return {
    bookings: row.bookings.filter((booking) => {
      if (booking.status === 'cancelled' || booking.status === 'completed') return false
      return at(booking.check_in, '14:00:00') < to && from < at(booking.check_out, '12:00:00')
    }),
    blocks: (row.blocks ?? []).filter((block) => block.start_date < after && first < block.end_date),
  }
}

// Minutes from a day's midnight to a date-time, held to that day.
function minuteOn(value: string, day: string): number {
  if (dayOf(value) < day) return 0
  if (dayOf(value) > day) return 1440
  return Math.round(dayShare(value) * 1440)
}

export const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

/** A day's stays by the hour as minutes of that day, by their start: the cell's strip
 *  and the day's panel. A stay over midnight shows on both days. */
export function hoursOn<S extends Stay & { status: string }>(stays: S[], day: string): { stay: S; from: number; to: number }[] {
  return stays
    .filter((stay) => stay.rental_mode === 'hourly' && stay.status !== 'cancelled')
    .map((stay) => ({ stay, from: minuteOn(stay.check_in, day), to: minuteOn(stay.check_out, day) }))
    .filter((part) => part.to > part.from)
    .sort((a, b) => a.from - b.from)
}

// The server's default check-out hour, where a closed time starts and ends.
const CLOSED_FROM = '12:00:00'

/** The hours of a day no stay holds, an hour or longer, "14:00"–"16:00": where one more
 *  stay by the hour fits. Today's start from the next whole hour. */
export function freeWindows(
  stays: (Pick<Stay, 'check_in' | 'check_out'> & { status: string })[],
  day: string,
  now?: string,
  closed: { start_date: string; end_date: string }[] = [],
): { from: string; to: string; hours: number }[] {
  const held = [
    ...stays.filter((stay) => stay.status !== 'cancelled' && stay.status !== 'completed'),
    // A closed time runs from the check-out hour of its first day to that of its last,
    // as the server counts it (blocks.py): the morning before it stays free.
    ...closed.map((block) => ({ check_in: `${block.start_date}T${CLOSED_FROM}`, check_out: `${block.end_date}T${CLOSED_FROM}` })),
  ]
    .map((stay) => ({ from: minuteOn(stay.check_in, day), to: minuteOn(stay.check_out, day) }))
    .filter((part) => part.to > part.from)
    .sort((a, b) => a.from - b.from)
  let start = now && dayOf(now) === day ? Math.ceil(minuteOn(now, day) / 60) * 60 : 0
  if (now && dayOf(now) > day) start = 1440
  const windows: { from: string; to: string; hours: number }[] = []
  for (const part of [...held, { from: 1440, to: 1440 }]) {
    if (part.from - start >= 60) {
      windows.push({ from: clock(start), to: clock(part.from), hours: Math.floor((part.from - start) / 60) })
    }
    start = Math.max(start, part.to)
  }
  return windows
}

/** Nights in a row as the server takes a range, [start, end): the picked nights of
 *  some weekdays break into runs, one write each. */
export function nightRuns(nights: string[]): { start_date: string; end_date: string }[] {
  const runs: { start_date: string; end_date: string }[] = []
  for (const night of [...nights].sort()) {
    const last = runs[runs.length - 1]
    if (last && last.end_date === night) last.end_date = addDays(night, 1)
    else runs.push({ start_date: night, end_date: addDays(night, 1) })
  }
  return runs
}

/** The days a flat has stays by the hour on: one cell each, however many stays. */
export function hourlyDays(stays: (Stay & { status: string })[]): string[] {
  const days = new Set<string>()
  for (const stay of stays) {
    if (stay.rental_mode !== 'hourly' || stay.status === 'cancelled') continue
    for (const day of nightsBetween(dayOf(stay.check_in), dayOf(stay.check_out))) {
      if (hoursOn([stay], day).length > 0) days.add(day)
    }
  }
  return [...days]
}

/** A flat's row: its bars by the night on lanes, and where each day of hours goes.
 *  A day of hours is one cell on the nights' lane. On a stay's check-in day its first
 *  night takes the cell: the hours go inside the bar, at its start (inside); a bar of
 *  one night has no room for them, so it carries a clock and the day opens from it
 *  (clocks). A cancelled or completed stay holds no night, as the server counts it. */
export function rowLayout(stays: (Stay & { status: string })[]): {
  lane: Map<string, number>
  count: number
  days: string[]
  inside: Map<string, string>
  clocks: Set<string>
} {
  const nights = stays.filter((stay) => stay.rental_mode !== 'hourly')
  const holding = nights.filter((stay) => stay.status !== 'cancelled' && stay.status !== 'completed')
  const oneNight = (stay: Stay) => barDays(stay.check_in, stay.check_out).end === addDays(dayOf(stay.check_in), 1)
  const arriving = new Map(holding.filter((stay) => !oneNight(stay)).map((stay) => [dayOf(stay.check_in), stay.id]))
  const clocked = new Map(holding.filter(oneNight).map((stay) => [dayOf(stay.check_in), stay.id]))
  const all = hourlyDays(stays)
  const days = all.filter((day) => !clocked.has(day))
  const lanes = assignLanes([
    ...nights,
    ...days.filter((day) => !arriving.has(day)).map((day) => ({ id: `h:${day}`, check_in: day, check_out: day, rental_mode: 'hourly' })),
  ])
  const inside = new Map<string, string>()
  for (const day of days) {
    const stayId = arriving.get(day)
    if (!stayId) continue
    lanes.lane.set(`h:${day}`, lanes.lane.get(stayId) ?? 0)
    inside.set(stayId, day)
  }
  const clocks = new Set(all.filter((day) => clocked.has(day)).map((day) => clocked.get(day) as string))
  return { ...lanes, days, inside, clocks }
}

/** Flats in the company's order; those it did not place after, by name. */
export function byCompanyOrder<R extends { property: { internal_name: string; position?: number | null } }>(rows: R[]): R[] {
  const place = (row: R) => row.property.position ?? Number.MAX_SAFE_INTEGER
  return [...rows].sort((a, b) => place(a) - place(b) || a.property.internal_name.localeCompare(b.property.internal_name))
}
