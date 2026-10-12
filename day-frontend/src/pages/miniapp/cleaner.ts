/** A cleaner's day in the Mini App, kept free of React so it can be tested. */

import type { CleaningStatus, CleaningTask } from '../../types/cleaning'

/** The only steps a cleaner takes: start, then done. Checking is the manager's. */
export function nextCleaningStep(status: CleaningStatus): CleaningStatus | null {
  if (status === 'assigned') return 'in_progress'
  if (status === 'in_progress') return 'done'
  return null
}

/** What is still to do, from any day, and what was finished today, grouped by
 *  day and sorted by hour. A task with no hour comes last in its day; one with
 *  no date, after every day. */
export function myCleaningDays(
  tasks: CleaningTask[],
  today: string,
): { date: string | null; tasks: CleaningTask[] }[] {
  const shown = tasks.filter((task) => nextCleaningStep(task.status) !== null || task.scheduled_date === today)
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
