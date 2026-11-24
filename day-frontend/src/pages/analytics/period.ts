import { addDays, addMonths, differenceInCalendarDays, format, parseISO, startOfMonth } from 'date-fns'

/** The owner's own period as the API takes it. The API counts [date_from, date_to),
 *  and the last day picked belongs in the report, so date_to is the day after it.
 *  Null until both ends are picked. */
export function customRange(from: string, to: string): { date_from: string; date_to: string } | null {
  if (!from || !to) return null
  return { date_from: from, date_to: format(addDays(parseISO(to), 1), 'yyyy-MM-dd') }
}

/** The period just before this one and as long, [date_from, date_to) as the API takes it:
 *  what the numbers are compared with. A rolling month of 31 days is compared with the 31 before. */
export function previousRange(from: string, to: string): { date_from: string; date_to: string } {
  const days = differenceInCalendarDays(parseISO(to), parseISO(from))
  return { date_from: format(addDays(parseISO(from), -days), 'yyyy-MM-dd'), date_to: from }
}

/** How much a number changed, in percent of what it was. Null with nothing to compare
 *  with: from zero any growth is endless. A loss that shrinks is a growth: of |before|. */
export function changeOf(now: number, before: number): number | null {
  if (!before) return null
  return ((now - before) / Math.abs(before)) * 100
}

/** The months the revenue by month shows: five before this one, this one and three ahead,
 *  calendar months as the API counts them, [date_from, date_to). Ahead is what is booked. */
export function monthsWindow(today: string): { date_from: string; date_to: string; current: string } {
  const first = startOfMonth(parseISO(today))
  return {
    date_from: format(addMonths(first, -5), 'yyyy-MM-dd'),
    date_to: format(addMonths(first, 4), 'yyyy-MM-dd'),
    current: format(first, 'yyyy-MM-dd'),
  }
}

/** The top of a chart's scale: the first round figure (1, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 of a power
 *  of ten) at or above the largest value, so the grid lines read as round sums and the bars fill
 *  most of the height. Zero for an empty chart. */
export function niceTop(max: number): number {
  if (!(max > 0)) return 0
  const power = 10 ** Math.floor(Math.log10(max))
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((step) => step * power).find((top) => top >= max * (1 - 1e-9))!
}

/** A bar of the period before: its first and last day, and the days between summed up. */
export type PreviousPoint = {
  first: string
  last: string
  revenue: number
  bookings_count: number
  booked_nights: number
  occupancy_rate: number
}

/** The period before, day by day, laid out on this period's bars: a bar of this period that
 *  starts on its 10th day and lasts 31 is set against days 10 to 40 of the period before, whatever
 *  calendar months those are. By index the bars would not match: a month against three days.
 *  The money, bookings and nights are summed; the rate is the mean of the days (the same flats
 *  every day). A bar with no day of the period before has nothing to compare with: null. */
export function alignPrevious(
  bars: { period_start: string | null }[],
  from: string,
  to: string,
  previousFrom: string,
  previousDays: { period_start: string | null; revenue: number; bookings_count: number; booked_nights: number; occupancy_rate: number }[],
): (PreviousPoint | null)[] {
  const offset = (day: string, start: string) => differenceInCalendarDays(parseISO(day), parseISO(start))
  const total = offset(to, from)
  const byOffset = new Map(previousDays.filter((d) => d.period_start).map((d) => [offset(d.period_start!, previousFrom), d]))
  const starts = bars.map((bar, i) => (bar.period_start ? Math.max(0, offset(bar.period_start, from)) : i))
  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : total
    const days = Array.from({ length: Math.max(end - start, 0) }, (_, k) => byOffset.get(start + k)).filter((d) => d !== undefined)
    if (days.length === 0) return null
    const sum = (pick: (d: (typeof days)[number]) => number) => days.reduce((acc, d) => acc + (Number(pick(d)) || 0), 0)
    return {
      first: days[0].period_start!,
      last: days[days.length - 1].period_start!,
      revenue: sum((d) => d.revenue),
      bookings_count: sum((d) => d.bookings_count),
      booked_nights: sum((d) => d.booked_nights),
      occupancy_rate: sum((d) => d.occupancy_rate) / days.length,
    }
  })
}
