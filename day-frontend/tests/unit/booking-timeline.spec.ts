/** A booking's history in a host's words: raw fields become events, payments join in,
 *  technical changes stay out. */

import { expect, test } from '@playwright/test'
import { timelineEvents } from '../../src/lib/booking-timeline'
import type { BookingAuditLog, BookingComment, BookingPayment } from '../../src/types/booking'

const log = (fields: Partial<BookingAuditLog>) =>
  ({ id: 'l', action: 'update', field_name: null, old_value: null, new_value: null, created_at: '2026-11-02T10:00:00', ...fields }) as BookingAuditLog
const payment = (fields: Partial<BookingPayment>) =>
  ({ id: 'p', amount: 100, type: 'payment', status: 'completed', created_at: '2026-11-02T11:00:00', ...fields }) as BookingPayment

test('raw fields become what happened', () => {
  const events = timelineEvents(
    [
      log({ id: 'a', field_name: '*', action: 'create' }),
      log({ id: 'b', field_name: 'status', new_value: 'confirmed' }),
      log({ id: 'c', field_name: 'check_out', new_value: '2026-11-09 12:00:00' }),
      log({ id: 'd', field_name: 'total_price', old_value: '400.00', new_value: '840.00' }),
      log({ id: 'e', field_name: 'notes' }),
    ],
    [],
  )
  expect(events.map((event) => event.kind)).toEqual(['created', 'status', 'checkOut', 'price', 'changed'])
  expect(events[3]).toMatchObject({ from: 400, to: 840 })
})

test('colours and holds are not events', () => {
  expect(timelineEvents([log({ field_name: 'gantt_color' }), log({ field_name: 'expires_at' })], [])).toEqual([])
})

test('payments join in, only received ones, the newest first', () => {
  const events = timelineEvents(
    [log({})],
    [payment({ paid_at: '2026-11-03T09:00:00' } as Partial<BookingPayment>), payment({ id: 'x', status: 'pending' })],
  )
  expect(events.map((event) => event.id)).toEqual(['p', 'l'])
})

test('a refund is told apart', () => {
  expect(timelineEvents([], [payment({ type: 'refund' })])[0]).toMatchObject({ kind: 'payment', refund: true })
})

test('a comment joins the history with its author', () => {
  const comment = { id: 'c1', content: 'Late arrival', author_id: 'u1', created_at: '2026-11-03T10:00:00' }
  const [event] = timelineEvents([], [], [comment as BookingComment])
  expect(event).toMatchObject({ kind: 'comment', text: 'Late arrival', by: 'u1' })
})
