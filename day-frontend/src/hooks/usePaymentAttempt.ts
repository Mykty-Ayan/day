import { useState } from 'react'
import type { PaymentMethod } from '../types/booking'

export interface PaymentAttempt {
  amount: number
  method: PaymentMethod
  note?: string
}

const same = (a: PaymentAttempt, b: PaymentAttempt) =>
  a.amount === b.amount && a.method === b.method && (a.note ?? '') === (b.note ?? '')

/** Money sent once, whatever happens to the answer. The last payment sent whose answer never
 *  came may be recorded: until one is known to be, the panel offers it again as it was, and
 *  sending it as it was sends its key again, so the server records it once. Anything else is a
 *  new payment with a new key. Kept by the panel, not its form: the form goes when it closes. */
export function usePaymentAttempt() {
  const [unsure, setUnsure] = useState<{ key: string; attempt: PaymentAttempt } | null>(null)
  return {
    /** What to offer when the panel opens: the payment whose answer never came, if any. */
    last: unsure?.attempt ?? null,
    /** The key to send `attempt` with; it stays unsure until `settled`. */
    keyFor(attempt: PaymentAttempt): string {
      const key = unsure && same(unsure.attempt, attempt) ? unsure.key : crypto.randomUUID()
      setUnsure({ key, attempt })
      return key
    },
    /** The answer came: the payment is recorded, and the next one is new. */
    settled() {
      setUnsure(null)
    },
  }
}
