import { useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { voidPaymentKey } from '../api/bookings'
import {
  readAttempt,
  readAttemptRaw,
  subscribeAttempts,
  writeAttempt,
  type PaymentAttempt,
} from '../lib/payment-attempt'
import { paymentMaybeRecorded } from '../pages/miniapp/booking-card'
import { useAddPayment } from './useBookings'

export type { PaymentAttempt } from '../lib/payment-attempt'

/** What a failed send leaves: refused (nothing recorded), recorded after all, never recorded
 *  (its key is closed), or unknown (the server could not be asked either); `gone` when a check
 *  finds nothing left to check. */
export type AttemptOutcome = 'refused' | 'recorded' | 'notRecorded' | 'unknown' | 'gone'

export interface SendOutcome {
  result: AttemptOutcome
  attempt: PaymentAttempt
  /** The server's own words for a refusal, when it gave them. */
  reason?: string
}

function refusalReason(error: unknown): string | undefined {
  const detail = (error as { response?: { data?: { detail?: unknown } } } | null)?.response?.data?.detail
  return typeof detail === 'string' ? detail : undefined
}

/** Money sent once, whatever happens to the answer. Each payment goes with a new key, kept by
 *  the booking until its answer comes (`useAddPayment` settles it, even with the panel gone).
 *  When the answer is lost the server is asked: it closes the key under its lock, so the payment
 *  is either recorded or never will be. Until then nothing more is sent for the booking: a resent
 *  key would be read as that payment, and a new payment of the same sum would be swallowed. */
export function usePaymentAttempt(bookingId: string) {
  const qc = useQueryClient()
  const raw = useSyncExternalStore(subscribeAttempts, () => readAttemptRaw(bookingId))
  const unsure = raw ? readAttempt(bookingId) : null

  async function ask(key: string): Promise<AttemptOutcome> {
    try {
      const outcome = await voidPaymentKey(bookingId, key)
      if (readAttempt(bookingId)?.key === key) writeAttempt(bookingId, null)
      qc.invalidateQueries({ queryKey: ['booking', bookingId] })
      qc.invalidateQueries({ queryKey: ['booking-payments', bookingId] })
      return outcome.voided ? 'notRecorded' : 'recorded'
    } catch {
      return 'unknown'
    }
  }

  return {
    /** A payment of this booking sent with no answer seen yet. */
    unsure,
    /** A new key for a new payment, kept until its answer comes. */
    begin(attempt: PaymentAttempt): string {
      const key = crypto.randomUUID()
      writeAttempt(bookingId, { key, attempt })
      return key
    },
    /** After a failed send of `key`. A refusal proves nothing was recorded; anything else is asked
     *  of the server. */
    async failed(error: unknown, key: string): Promise<AttemptOutcome> {
      if (!paymentMaybeRecorded(error)) {
        if (readAttempt(bookingId)?.key === key) writeAttempt(bookingId, null)
        return 'refused'
      }
      // Asked by its own key, kept or not: storage may have failed to keep it.
      return ask(key)
    },
    /** Ask the server about the unsure payment now. */
    check(): Promise<AttemptOutcome> {
      const current = readAttempt(bookingId)
      return current ? ask(current.key) : Promise.resolve('gone')
    },
  }
}

/** Sends a payment or a refund of the booking and settles a lost answer; `onDone` once it is
 *  recorded. Used by the panels that take or give back money. */
export function useSendPayment(bookingId: string, onDone: () => void) {
  const addPayment = useAddPayment(bookingId)
  const attempt = usePaymentAttempt(bookingId)
  const [outcome, setOutcome] = useState<SendOutcome | null>(null)
  const [checking, setChecking] = useState(false)

  function after(result: AttemptOutcome, sent: PaymentAttempt, reason?: string) {
    if (result === 'recorded') {
      setOutcome(null)
      onDone()
    } else if (result === 'gone') setOutcome(null)
    else setOutcome({ result, attempt: sent, reason })
  }

  function send(input: PaymentAttempt) {
    setOutcome(null)
    const key = attempt.begin(input)
    addPayment.mutate(
      { amount: input.amount, type: input.type, method: input.method, note: input.note, idempotencyKey: key },
      {
        onSuccess: onDone,
        onError: async (error) => {
          setChecking(true)
          const result = await attempt.failed(error, key)
          setChecking(false)
          after(result, input, refusalReason(error))
        },
      },
    )
  }

  async function check() {
    const asked = attempt.unsure
    if (!asked) return
    setChecking(true)
    const result = await attempt.check()
    setChecking(false)
    after(result, asked.attempt)
  }

  return { send, check, outcome, checking, unsure: attempt.unsure, pending: addPayment.isPending }
}
