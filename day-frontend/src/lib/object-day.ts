/** The objects list as a board for today: each object's day, what is next, and what it lacks. */

import type { Booking, GanttBlock } from '../types/booking'
import type { CleaningTask } from '../types/cleaning'
import type { Property, PropertySetup } from '../types/property'
import { priced, stayNow } from './property-overview'

type Stay = Pick<Booking, 'id' | 'check_in' | 'check_out' | 'status' | 'rental_mode' | 'guest_name'>

const DAY_MIN = 1440
const LIVE = new Set(['pending', 'confirmed', 'checked_in'])
// A stay drawn on the day: a guest who has left today still shows where they were.
const DRAWN = new Set([...LIVE, 'checked_out', 'completed'])
const OPEN_CLEANING = new Set(['pending', 'assigned', 'in_progress'])

export type SegmentTone = 'in' | 'booked' | 'pending' | 'gone' | 'closed'

/** A piece of the day in minutes from midnight, 0..1440, as on the chessboard's colours. */
export interface Segment {
  id: string
  from: number
  to: number
  tone: SegmentTone
  stay: Stay | null
}

const nextDay = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Minutes from the day's midnight to a wall-clock "YYYY-MM-DDTHH:mm[:ss]", kept within the day. */
function clip(at: string, start: string, end: string): number {
  if (at <= start) return 0
  if (at >= end) return DAY_MIN
  return Number(at.slice(11, 13)) * 60 + Number(at.slice(14, 16))
}

const TONE: Record<string, SegmentTone> = {
  checked_in: 'in',
  confirmed: 'booked',
  pending: 'pending',
  checked_out: 'gone',
  completed: 'gone',
}

/** When closed dates start and end: their hours when given (the check-out hour of the first and the
 *  last day), else whole days, the end date being the day out. */
function blockSpan(block: GanttBlock): [string, string] {
  return [block.starts_at ?? `${block.start_date}T00:00:00`, block.ends_at ?? `${block.end_date}T00:00:00`]
}

/** Until when a stay holds the object. A guest marked out is drawn up to now at most; one still
 *  marked in after the check-out is in until marked out, so up to now at least. */
function heldUntil(stay: Stay, now: string): string {
  if (TONE[stay.status] === 'gone') return stay.check_out > now ? now : stay.check_out
  if (stay.status === 'checked_in' && stay.check_out < now) return now
  return stay.check_out
}

/** Today's stays and closed hours, in order. `now` is the company's wall clock, "YYYY-MM-DDTHH:mm:ss". */
export function daySegments(stays: Stay[], blocks: GanttBlock[], now: string): Segment[] {
  const day = now.slice(0, 10)
  const start = `${day}T00:00:00`
  const end = `${nextDay(day)}T00:00:00`
  const out: Segment[] = []
  for (const stay of stays) {
    if (!DRAWN.has(stay.status)) continue
    // A guest who left before a later day was due is long gone: when is not known.
    if (TONE[stay.status] === 'gone' && stay.check_out >= end) continue
    const until = heldUntil(stay, now)
    if (stay.check_in >= end || until <= start) continue
    out.push({ id: stay.id, from: clip(stay.check_in, start, end), to: clip(until, start, end), tone: TONE[stay.status], stay })
  }
  for (const block of blocks) {
    const [from, to] = blockSpan(block)
    if (from >= end || to <= start) continue
    out.push({ id: block.id, from: clip(from, start, end), to: clip(to, start, end), tone: 'closed', stay: null })
  }
  return out.sort((a, b) => a.from - b.from)
}

export interface ObjectDay {
  current: Stay | null
  next: Stay | null
  /** Stays that start today, and stays that end today, hourly ones among them. */
  arrivals: Stay[]
  departures: Stay[]
  /** A cleaning due today or before that nobody has finished. */
  cleaning: boolean
  /** Closed dates hold the object now: repairs, the owner's own guests, a stay sold on another site. */
  closed: boolean
}

/** What happens in one object today. `now` is the company's wall clock, "YYYY-MM-DDTHH:mm:ss". */
export function objectDay(stays: Stay[], blocks: GanttBlock[], tasks: CleaningTask[], now: string): ObjectDay {
  const today = now.slice(0, 10)
  const { current, next } = stayNow(stays, now)
  return {
    current,
    next,
    arrivals: stays.filter((s) => LIVE.has(s.status) && s.check_in.slice(0, 10) === today),
    departures: stays.filter((s) => DRAWN.has(s.status) && s.check_out.slice(0, 10) === today),
    cleaning: tasks.some((task) => OPEN_CLEANING.has(task.status) && (task.scheduled_date ?? today) <= today),
    closed: blocks.some((block) => {
      const [from, to] = blockSpan(block)
      return from <= now && now < to
    }),
  }
}

export type DayCount = 'arrivals' | 'departures' | 'living' | 'cleaning' | 'free'
export const DAY_COUNTS: DayCount[] = ['arrivals', 'departures', 'living', 'cleaning', 'free']

/** Whether an object belongs under one of the day's counters. */
export function inCount(day: ObjectDay, count: DayCount): boolean {
  switch (count) {
    case 'arrivals':
      return day.arrivals.length > 0
    case 'departures':
      return day.departures.length > 0
    case 'living':
      return day.current !== null
    case 'cleaning':
      return day.cleaning
    case 'free':
      return day.current === null && !day.cleaning && !day.closed
  }
}

/** The day's counters: stays for arrivals and departures, objects for the rest. */
export function dayCounts(days: ObjectDay[]): Record<DayCount, number> {
  return {
    arrivals: days.reduce((n, d) => n + d.arrivals.length, 0),
    departures: days.reduce((n, d) => n + d.departures.length, 0),
    living: days.filter((d) => inCount(d, 'living')).length,
    cleaning: days.filter((d) => inCount(d, 'cleaning')).length,
    free: days.filter((d) => inCount(d, 'free')).length,
  }
}

export const PROBLEMS = ['noPrices', 'noPhotos', 'fewPhotos', 'noCheckIn', 'calendar'] as const
export type Problem = (typeof PROBLEMS)[number]

/** What keeps an object from selling or a guest from getting in. Prices and calendars still
 *  loading (no setup yet) read as fine. */
export function objectProblems(property: Property, setup: PropertySetup | undefined): Problem[] {
  // The same rules as the readiness card on the object's page: a price, 3 photos, how to get in.
  const photos = property.photos.filter((p) => p.audience !== 'guest').length
  const out: Problem[] = []
  if (setup && !priced(property, setup.pricing)) out.push('noPrices')
  if (photos === 0) out.push('noPhotos')
  else if (photos < 3) out.push('fewPhotos')
  if (!property.check_in_instructions?.trim()) out.push('noCheckIn')
  if (setup?.calendar_error) out.push('calendar')
  return out
}
