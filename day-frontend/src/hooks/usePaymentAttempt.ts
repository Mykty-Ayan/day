import { useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { voidPaymentKey } from '../api/bookings'
import { useAddPayment } from './useBookings'
import { paymentMaybeRecorded } from '../pages/miniapp/booking-card'
import type { PaymentMethod } from '../types/booking'

export interface PaymentAttempt {
  type: 'payment' | 'refund'
  amount: number
  method: PaymentMethod
  note?: string
}

interface Unsure {
  key: string
  attempt: PaymentAttempt
  /** An earlier send got no clear answer: the money may be recorded already. */
  uncertain?: boolean
}

/** What a failed send leaves: refused (nothing recorded), recorded after all, never recorded
 *  (its key is closed), or unknown (the server could not be asked either). */
export type AttemptOutcome = 'refused' | 'recorded' | 'notRecorded' | 'unknown'

// One attempt per booking, for every panel of it on the page and after a reload: two panels
// of one booking, or a panel closed and opened again, must never send one payment under two keys.
const listeners = new Set<() => void>()
const storageKey = (bookingId: string) => `day.payment-attempt.${bookingId}`

function readRaw(bookingId: string): string | null {
  try {
    return sessionStorage.getItem(storageKey(bookingId))
  } catch {
    return null
  }
}

function read(bookingId: string): Unsure | null {
  const raw = readRaw(bookingId)
  try {
    return raw ? (JSON.parse(raw) as Unsure) : null
  } catch {
    return null
  }
}

function write(bookingId: string, value: Unsure | null) {
  try {
    if (value) sessionStorage.setItem(storageKey(bookingId), JSON.stringify(value))
    else sessionStorage.removeItem(storageKey(bookingId))
  } catch {
    // Without storage the attempt lives no longer than the page; the server still settles it.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const same = (a: PaymentAttempt, b: PaymentAttempt) =>
  a.type === b.type && a.amount === b.amount && a.method === b.method && (a.note ?? '') === (b.note ?? '')

/** Money sent once, whatever happens to the answer. Each payment goes with a key, kept by the
 *  booking until an answer comes. When the answer is lost the server is asked: it closes the key
 *  under its lock, so the payment is either recorded or never will be. If even that cannot be
 *  asked, the attempt stays, and the panel offers only to send it again as it was (the same key,
 *  recorded once) or to ask again. */
export function usePaymentAttempt(bookingId: string) {
  const qc = useQueryClient()
  const raw = useSyncExternalStore(subscribe, () => readRaw(bookingId))
  const unsure = raw ? read(bookingId) : null

  async function ask(current: Unsure): Promise<AttemptOutcome> {
    // Unsure from now on: a reload while the server is asked must not take it for a fresh send.
    write(bookingId, { ...current, uncertain: true })
    try {
      const outcome = await voidPaymentKey(bookingId, current.key)
      write(bookingId, null)
      qc.invalidateQueries({ queryKey: ['booking', bookingId] })
      qc.invalidateQueries({ queryKey: ['booking-payments', bookingId] })
      return outcome.voided ? 'notRecorded' : 'recorded'
    } catch {
      write(bookingId, { ...current, uncertain: true })
      return 'unknown'
    }
  }

  return {
    /** A payment of this booking sent with no answer seen yet. */
    unsure,
    /** The key to send `attempt` with: the unsure one's own key when it goes again as it was. */
    begin(attempt: PaymentAttempt): string {
      const current = read(bookingId)
      const kept = current && same(current.attempt, attempt) ? current : null
      const key = kept?.key ?? crypto.randomUUID()
      write(bookingId, { key, attempt, uncertain: kept?.uncertain })
      return key
    },
    /** The answer came: recorded, and the next payment is a new one. */
    settled(key: string) {
      if (read(bookingId)?.key === key) write(bookingId, null)
    },
    /** After a failed send of `key`. A refusal of a first send proves nothing was recorded;
     *  anything else, or a refused retry of a send whose answer was lost, is asked of the server. */
    async failed(error: unknown, key: string): Promise<AttemptOutcome> {
      const current = read(bookingId)
      if (!current || current.key !== key) return 'refused'
      if (!paymentMaybeRecorded(error) && !current.uncertain) {
        write(bookingId, null)
        return 'refused'
      }
      return ask({ ...current, uncertain: true })
    },
    /** Ask the server about the unsure payment now. */
    check(): Promise<AttemptOutcome> {
      const current = read(bookingId)
      return current ? ask(current) : Promise.resolve('refused')
    },
  }
}

/** Sends a payment or a refund of the booking and settles a lost answer; `onDone` once it is
 *  recorded. Used by the panels that take or give back money. */
export function useSendPayment(bookingId: string, onDone: () => void) {
  const addPayment = useAddPayment(bookingId)
  const attempt = usePaymentAttempt(bookingId)
  const [outcome, setOutcome] = useState<{ result: AttemptOutcome; attempt: PaymentAttempt } | null>(null)
  const [checking, setChecking] = useState(false)

  function after(result: AttemptOutcome, sent: PaymentAttempt) {
    if (result === 'recorded') {
      setOutcome(null)
      onDone()
    } else setOutcome({ result, attempt: sent })
  }

  function send(input: PaymentAttempt) {
    setOutcome(null)
    const key = attempt.begin(input)
    addPayment.mutate(
      { amount: input.amount, type: input.type, method: input.method, note: input.note, idempotencyKey: key },
      {
        onSuccess: () => {
          attempt.settled(key)
          onDone()
        },
        onError: async (error) => {
          setChecking(true)
          const result = await attempt.failed(error, key)
          setChecking(false)
          after(result, input)
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
