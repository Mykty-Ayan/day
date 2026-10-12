/**
 * A cleaner's day in the Mini App: only their own tasks, what is still to do
 * plus today's finished ones, by day and hour, and one step at a time.
 */

import { expect, test } from '@playwright/test'
import { roleFromToken } from '../../src/lib/token'
import { myCleaningDays, nextCleaningStep } from '../../src/pages/miniapp/cleaner'
import type { CleaningTask } from '../../src/types/cleaning'

const task = (overrides: Partial<CleaningTask>) =>
  ({
    id: 't',
    status: 'assigned',
    scheduled_date: '2026-10-13',
    scheduled_time: '12:00',
    property_name: '62auc',
    ...overrides,
  }) as CleaningTask

test('the role comes from the session token', () => {
  const token = `h.${btoa(JSON.stringify({ sub: 'u-1', company_id: 'c-1', role: 'cleaner' })).replace(/=+$/, '')}.s`
  expect(roleFromToken(token)).toBe('cleaner')
  expect(roleFromToken('broken')).toBeNull()
  expect(roleFromToken(null)).toBeNull()
})

test('a task moves one step: start, then done; nothing after', () => {
  expect(nextCleaningStep('assigned')).toBe('in_progress')
  expect(nextCleaningStep('in_progress')).toBe('done')
  expect(nextCleaningStep('done')).toBeNull()
  expect(nextCleaningStep('verified')).toBeNull()
})

test('the day shows what is still to do and what was finished today, by day and hour', () => {
  const days = myCleaningDays(
    [
      task({ id: 'tomorrow', scheduled_date: '2026-10-14', scheduled_time: '11:00' }),
      task({ id: 'late', scheduled_time: '16:00' }),
      task({ id: 'early', scheduled_time: '09:30', status: 'in_progress' }),
      task({ id: 'done-today', scheduled_time: '10:00', status: 'done' }),
      task({ id: 'done-yesterday', scheduled_date: '2026-10-12', status: 'done' }),
      task({ id: 'left-yesterday', scheduled_date: '2026-10-12', status: 'in_progress' }),
    ],
    '2026-10-13',
  )

  expect(days.map((day) => [day.date, day.tasks.map((item) => item.id)])).toEqual([
    ['2026-10-12', ['left-yesterday']],
    ['2026-10-13', ['early', 'done-today', 'late']],
    ['2026-10-14', ['tomorrow']],
  ])
})

test('a task with no date or hour comes last in its day', () => {
  const days = myCleaningDays(
    [task({ id: 'any-time', scheduled_time: null }), task({ id: 'noon' }), task({ id: 'undated', scheduled_date: null })],
    '2026-10-13',
  )
  expect(days.map((day) => [day.date, day.tasks.map((item) => item.id)])).toEqual([
    ['2026-10-13', ['noon', 'any-time']],
    [null, ['undated']],
  ])
})
