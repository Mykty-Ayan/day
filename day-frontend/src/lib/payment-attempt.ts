import type { PaymentMethod } from '../types/booking'

/** A payment or refund of a booking, sent with its own key and no answer seen yet. */
export interface PaymentAttempt {
  type: 'payment' | 'refund'
  amount: number
  method: PaymentMethod
  note?: string
}

export interface StoredAttempt {
  key: string
  attempt: PaymentAttempt
}

// One attempt per booking, for every panel of it on the page and after a reload: a panel closed
// mid-request, or another panel of the same booking, still knows a payment may be recorded.
const listeners = new Set<() => void>()
const storageKey = (bookingId: string) => `day.payment-attempt.${bookingId}`

export function readAttemptRaw(bookingId: string): string | null {
  try {
    return sessionStorage.getItem(storageKey(bookingId))
  } catch {
    return null
  }
}

export function readAttempt(bookingId: string): StoredAttempt | null {
  const raw = readAttemptRaw(bookingId)
  try {
    return raw ? (JSON.parse(raw) as StoredAttempt) : null
  } catch {
    return null
  }
}

export function writeAttempt(bookingId: string, value: StoredAttempt | null) {
  try {
    if (value) sessionStorage.setItem(storageKey(bookingId), JSON.stringify(value))
    else sessionStorage.removeItem(storageKey(bookingId))
  } catch {
    // Without storage the attempt lives no longer than the page; the server still keeps its key.
  }
  listeners.forEach((listener) => listener())
}

export function subscribeAttempts(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The answer to `key` came: it is recorded. Only that attempt goes, not a newer one. */
export function settleAttempt(bookingId: string, key: string) {
  if (readAttempt(bookingId)?.key === key) writeAttempt(bookingId, null)
}
