import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'

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
