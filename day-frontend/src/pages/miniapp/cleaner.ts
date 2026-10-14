/** A cleaner's day in the Mini App, kept free of React so it can be tested. */

import type { CleaningStatus, CleaningTask } from '../../types/cleaning'
import { toISODate } from './format'

/** The local day of a server time. The server writes UTC with no zone mark. */
export function localDay(serverTime: string): string {
  const marked = /(Z|[+-]\d\d:?\d\d)$/.test(serverTime) ? serverTime : `${serverTime}Z`
  return toISODate(new Date(marked))
}

/** The only steps a cleaner takes: start, then done. Checking is the manager's. */
export function nextCleaningStep(status: CleaningStatus): CleaningStatus | null {
  if (status === 'assigned') return 'in_progress'
  if (status === 'in_progress') return 'done'
  return null
}

/** What is still to do, from any day, and what was finished today (by when it
 *  was finished, or planned when that is not known), grouped by the day it was
 *  planned for and sorted by hour. A task with no hour comes last in its day;
 *  one with no date, after every day. */
export function myCleaningDays(
  tasks: CleaningTask[],
  today: string,
  dayOf: (serverTime: string) => string = localDay,
): { date: string | null; tasks: CleaningTask[] }[] {
  const finishedToday = (task: CleaningTask) =>
    task.completed_at ? dayOf(task.completed_at) === today : task.scheduled_date === today
  const shown = tasks.filter((task) => nextCleaningStep(task.status) !== null || finishedToday(task))
  const last = '￿'
  shown.sort(
    (a, b) =>
      (a.scheduled_date ?? last).localeCompare(b.scheduled_date ?? last) ||
      (a.scheduled_time ?? last).localeCompare(b.scheduled_time ?? last),
  )
  const days: { date: string | null; tasks: CleaningTask[] }[] = []
  for (const task of shown) {
    const date = task.scheduled_date ?? null
    if (days.at(-1)?.date !== date) days.push({ date, tasks: [] })
    days.at(-1)!.tasks.push(task)
  }
  return days
}
