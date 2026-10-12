/**
 * A cleaner's day in the Mini App: only their own tasks, what is still to do
 * plus today's finished ones, by day and hour, and one step at a time.
 */

import { expect, test } from '@playwright/test'
import { identityChanged, roleFromToken, sessionIdentity } from '../../src/lib/token'
import { localDay, myCleaningDays, nextCleaningStep } from '../../src/pages/miniapp/cleaner'
import { toISODate } from '../../src/pages/miniapp/format'
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

const token = (claims: Record<string, unknown>) => `h.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.s`

test('a session is told apart by its user, company and role', () => {
  const manager = sessionIdentity(token({ sub: 'u-1', company_id: 'c-a', role: 'manager' }))
  const cleaner = sessionIdentity(token({ sub: 'u-2', company_id: 'c-b', role: 'cleaner' }))
  const refreshed = sessionIdentity(token({ sub: 'u-1', company_id: 'c-a', role: 'manager', iat: 2 }))
  // The chat was relinked to a cleaner of another company and signed in again by itself.
  expect(identityChanged(manager, cleaner)).toBe(true)
  expect(identityChanged(manager, refreshed)).toBe(false)
  // Signed out, or not signed in yet: nothing to compare.
  expect(identityChanged(manager, null)).toBe(false)
  expect(identityChanged(null, cleaner)).toBe(false)
})

test('a completion time from the server (UTC, no zone) is read as the local day', () => {
  expect(localDay('2026-10-12T19:50:44.582635')).toBe(toISODate(new Date(Date.UTC(2026, 9, 12, 19, 50, 44))))
  expect(localDay('2026-10-12T19:50:44Z')).toBe(toISODate(new Date(Date.UTC(2026, 9, 12, 19, 50, 44))))
})

test('finished today means finished today, whatever day it was planned for', () => {
  const sameDay = (value: string) => value.slice(0, 10)
  const days = myCleaningDays(
    [
      task({ id: 'planned-yesterday-done-today', scheduled_date: '2026-10-12', status: 'done', completed_at: '2026-10-13T08:00:00' }),
      task({ id: 'planned-today-done-yesterday', status: 'done', completed_at: '2026-10-12T21:00:00' }),
      task({ id: 'done-no-time', status: 'done', completed_at: null }),
    ],
    '2026-10-13',
    sameDay,
  )
  expect(days.map((day) => [day.date, day.tasks.map((item) => item.id)])).toEqual([
    ['2026-10-12', ['planned-yesterday-done-today']],
    ['2026-10-13', ['done-no-time']],
  ])
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
