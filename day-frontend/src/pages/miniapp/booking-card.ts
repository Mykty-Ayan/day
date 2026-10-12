/**
 * Rules behind the Mini App booking card, kept free of React so they can be
 * tested on their own. Each of these used to be a one-tap action with no check.
 */

import type { Booking, BookingPayment, BookingStatus, PaymentMethod } from '../../types/booking'

export { phoneDigits } from '../../lib/phone'

/** Cancelling is for a booking that has not started yet. */
export function canCancel(status: BookingStatus): boolean {
  return status === 'pending' || status === 'confirmed'
}

/** The new check-out after "extend": a night for a stay, an hour for an hourly
 *  booking, at the same time of day. Null when the booking can no longer grow. */
export function extendedCheckOut(
  booking: Pick<Booking, 'status' | 'rental_mode' | 'check_out'>,
): string | null {
  if (booking.status !== 'confirmed' && booking.status !== 'checked_in') return null
  const [day, time = '12:00:00'] = booking.check_out.split('T')
  const [year, month, date] = day.split('-').map(Number)
  const [hour, minute, second = 0] = time.split(':').map(Number)
  // UTC maths only to step the calendar; the result stays a local wall-clock time.
  const next = new Date(Date.UTC(year, month - 1, date, hour, minute, second))
  if (booking.rental_mode === 'hourly') next.setUTCHours(next.getUTCHours() + 1)
  else next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 19)
}

/** What arrived, what is still owed, and payments recorded but not yet received. */
export function settlement(total: number, payments: BookingPayment[]) {
  const paid = payments
    .filter((payment) => payment.status === 'completed')
    .reduce((sum, payment) => sum + (payment.type === 'refund' ? -payment.amount : payment.amount), 0)
  const waiting = payments.filter((payment) => payment.status === 'pending' && payment.type !== 'refund')
  return { paid, due: Math.max(0, total - paid), waiting }
}

/** After a failed money call: was it perhaps saved anyway? No answer, a proxy
 *  timeout or a gateway error can all come after the server committed; only a
 *  refusal (4xx) proves nothing was recorded. */
export function paymentMaybeRecorded(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status
  return status === undefined || status >= 500 || status === 408
}

/** A money action whose outcome is not known yet. Kept outside the card so that
 *  closing it mid-request, or reopening it, still retries with the same key. */
export type MoneyAttempt =
  | { kind: 'payment'; amount: number; method: PaymentMethod; key: string }
  | { kind: 'receive'; paymentId: string; amount: number }

type AttemptStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const attemptKey = (bookingId: string) => `day.miniapp.money.${bookingId}`

export function loadAttempt(storage: AttemptStore | undefined, bookingId: string): MoneyAttempt | null {
  try {
    const raw = storage?.getItem(attemptKey(bookingId))
    return raw ? (JSON.parse(raw) as MoneyAttempt) : null
  } catch {
    return null
  }
}

export function saveAttempt(storage: AttemptStore | undefined, bookingId: string, attempt: MoneyAttempt | null): void {
  try {
    if (attempt) storage?.setItem(attemptKey(bookingId), JSON.stringify(attempt))
    else storage?.removeItem(attemptKey(bookingId))
  } catch {
    // Storage blocked or full: the attempt still lives in the card while it is open.
  }
}
