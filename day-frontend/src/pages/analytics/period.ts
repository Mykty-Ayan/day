import { addDays, format, parseISO } from 'date-fns'

/** The owner's own period as the API takes it. The API counts [date_from, date_to),
 *  and the last day picked belongs in the report, so date_to is the day after it.
 *  Null until both ends are picked. */
export function customRange(from: string, to: string): { date_from: string; date_to: string } | null {
  if (!from || !to) return null
  return { date_from: from, date_to: format(addDays(parseISO(to), 1), 'yyyy-MM-dd') }
}
