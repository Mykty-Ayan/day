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
export type MoneyAttempt = (
  | { kind: 'payment'; amount: number; method: PaymentMethod; key: string }
  | { kind: 'receive'; paymentId: string; amount: number }
) & {
  /** An earlier call got no clear answer: the money may be recorded already. */
  uncertain?: boolean
  /** The number of the latest send: a late answer to an earlier one is told apart. */
  call?: number
}

/** The attempt as it goes out once more. */
export function nextCall<T extends { call?: number }>(attempt: T): T {
  return { ...attempt, call: (attempt.call ?? 0) + 1 }
}

/** Whether a failed send is the latest one of the attempt kept on the phone. Only
 *  then may its failure change the attempt: a late refusal of the first send
 *  must not drop a retry whose answer was lost. */
export function latestCall(stored: MoneyAttempt | null, failed: MoneyAttempt): stored is MoneyAttempt {
  return sameAttempt(stored, failed) && stored?.call === failed.call
}

/** What is left of an attempt after its call failed. A refusal of the first
 *  call proves nothing was recorded. Once an answer was lost, a refused retry
 *  (a rate limit, an expired session) says nothing about the first call: the
 *  attempt stays until a retry succeeds or the operator checks the history. */
export function afterFailure<T extends { uncertain?: boolean }>(attempt: T, error: unknown): T | null {
  if (paymentMaybeRecorded(error)) return { ...attempt, uncertain: true }
  return attempt.uncertain ? attempt : null
}

/** What a fresh read says of a "received" whose answer was lost. Only a
 *  completed payment settles it. A pending one may still be confirmed by the
 *  lost call, so nothing new is recorded until a retry lands; a failed or
 *  missing one can never be confirmed. */
export function receiveOutcome(payment: BookingPayment | undefined): 'received' | 'waiting' | 'gone' {
  if (payment?.status === 'completed') return 'received'
  if (payment?.status === 'pending') return 'waiting'
  return 'gone'
}

export type AttemptStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const attemptKey = (bookingId: string) => `day.miniapp.money.${bookingId}`

/** The part of the Web Locks API used here. */
export interface AttemptLocks {
  request<T>(name: string, run: () => T | PromiseLike<T>): Promise<T>
}

function webLocks(): AttemptLocks | undefined {
  try {
    return (navigator as Navigator & { locks?: AttemptLocks }).locks
  } catch {
    return undefined
  }
}

/** Runs a read and a write of an attempt kept on the phone as one step. The
 *  windows of the app share that storage, so without a shared lock two of them
 *  could both find no attempt and each send the money under its own key.
 *  Without Web Locks (an old webview) it runs unlocked, as one window always did. */
export function withAttemptLock<T>(
  name: string,
  run: () => T | PromiseLike<T>,
  locks: AttemptLocks | undefined = webLocks(),
): Promise<T> {
  return locks ? locks.request(name, run) : Promise.resolve().then(run)
}

/** The lock of one booking's money attempt. */
export function withMoneyLock<T>(
  bookingId: string,
  run: () => T | PromiseLike<T>,
  locks: AttemptLocks | undefined = webLocks(),
): Promise<T> {
  return withAttemptLock(attemptKey(bookingId), run, locks)
}

export function loadStored<T>(storage: AttemptStore | undefined, key: string): T | null {
  try {
    const raw = storage?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

/** Whether the value is kept on the phone (or removed, for null). */
export function saveStored(storage: AttemptStore | undefined, key: string, value: unknown): boolean {
  if (!storage) return false
  try {
    if (value === null) storage.removeItem(key)
    else storage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** An attempt found on the phone. Its first answer may never have been seen (the
 *  app was closed mid-request), so it counts as possibly recorded. */
export function loadAttempt(storage: AttemptStore | undefined, bookingId: string): MoneyAttempt | null {
  const stored = loadStored<MoneyAttempt>(storage, attemptKey(bookingId))
  return stored ? { ...stored, uncertain: true } : null
}

/** The attempt exactly as the last send kept it, to judge that send's failure. */
export function storedAttempt(storage: AttemptStore | undefined, bookingId: string): MoneyAttempt | null {
  return loadStored<MoneyAttempt>(storage, attemptKey(bookingId))
}

/** Whether an answer belongs to this attempt: a late answer to an earlier one
 *  must not settle, or overwrite, a newer one. */
export function sameAttempt(current: MoneyAttempt | null, finished: MoneyAttempt): boolean {
  if (!current || current.kind !== finished.kind) return false
  return current.kind === 'payment'
    ? current.key === (finished as typeof current).key
    : current.paymentId === (finished as typeof current).paymentId
}

/** Whether the attempt is kept on the phone. Money is not sent unkept: closing
 *  the card mid-request would lose the key, and the next try would double it. */
export function saveAttempt(storage: AttemptStore | undefined, bookingId: string, attempt: MoneyAttempt | null): boolean {
  return saveStored(storage, attemptKey(bookingId), attempt)
}
