/** A booking's history in events a host can read: the audit log's raw fields become
 *  what happened, payments join in, and technical changes stay out. */

import type { BookingAuditLog, BookingComment, BookingPayment, BookingStatus } from '../types/booking'

/** by: the user behind it, when the log knows; payments don't keep one. */
export type TimelineEvent = { id: string; at: string; by?: string | null } & (
  | { kind: 'created' }
  | { kind: 'status'; status: BookingStatus }
  | { kind: 'checkIn' | 'checkOut'; value: string }
  | { kind: 'price'; from: number; to: number }
  | { kind: 'payment'; amount: number; refund: boolean }
  | { kind: 'comment'; text: string }
  | { kind: 'changed' }
)

// Colour on the calendar and the like: nothing that happened to the stay.
const QUIET = new Set(['gantt_color', 'gantt_icon', 'expires_at'])

function fromLog(log: BookingAuditLog): TimelineEvent | null {
  const base = { id: log.id, at: log.created_at, by: log.changed_by }
  if (log.action === 'create' || log.field_name === '*') return { ...base, kind: 'created' }
  if (log.field_name === 'status') return { ...base, kind: 'status', status: log.new_value as BookingStatus }
  if (log.field_name === 'check_in') return { ...base, kind: 'checkIn', value: log.new_value ?? '' }
  if (log.field_name === 'check_out') return { ...base, kind: 'checkOut', value: log.new_value ?? '' }
  if (log.field_name === 'total_price') {
    return { ...base, kind: 'price', from: Number(log.old_value), to: Number(log.new_value) }
  }
  return log.field_name && QUIET.has(log.field_name) ? null : { ...base, kind: 'changed' }
}

export function timelineEvents(
  logs: BookingAuditLog[],
  payments: BookingPayment[],
  comments: BookingComment[] = [],
): TimelineEvent[] {
  const paid = payments
    .filter((payment) => payment.status === 'completed')
    .map((payment): TimelineEvent => ({
      id: payment.id,
      at: payment.paid_at || payment.created_at,
      kind: 'payment',
      amount: Number(payment.amount),
      refund: payment.type === 'refund',
    }))
  const logged = logs.flatMap((log) => fromLog(log) ?? [])
  const said = comments.map((comment): TimelineEvent => ({
    id: comment.id,
    at: comment.created_at,
    by: comment.author_id,
    kind: 'comment',
    text: comment.content,
  }))
  return [...logged, ...paid, ...said].sort((a, b) => b.at.localeCompare(a.at))
}
