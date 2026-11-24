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
