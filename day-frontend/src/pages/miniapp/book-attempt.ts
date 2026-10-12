/** One press of "Book", and what is left of it when the answer is lost. */

import type { BookingCreateInput } from '../../types/booking'
import { loadStored, saveStored, type AttemptStore } from './booking-card'

/** The form as it was at the press, under one Idempotency-Key. */
export interface BookingAttempt {
  body: BookingCreateInput
  key: string
  /** The flat's name, for the banner when the sheet is opened for another flat. */
  unit: string
  /** An earlier call got no clear answer: the booking may exist already. */
  uncertain?: boolean
}

// One per phone: until it is settled, no other booking starts, whichever flat.
const KEY = 'day.miniapp.booking'

export function loadBookingAttempt(storage: AttemptStore | undefined): BookingAttempt | null {
  return loadStored<BookingAttempt>(storage, KEY)
}

export function saveBookingAttempt(storage: AttemptStore | undefined, attempt: BookingAttempt | null): boolean {
  return saveStored(storage, KEY, attempt)
}

export type BookingStart = 'sent' | 'checkFailed' | 'declined' | 'closed' | 'notKept'

/** The steps after the press. The blacklist is asked for the phone as it was
 *  pressed (the server does not ask it); a sheet closed meanwhile books nothing;
 *  the attempt is kept on the phone before it is sent. */
export async function startBooking(
  attempt: BookingAttempt,
  steps: {
    digits: string
    check: (digits: string) => Promise<{ warned: boolean }>
    confirmWarned: () => Promise<boolean>
    isOpen: () => boolean
    keep: (attempt: BookingAttempt) => boolean
    send: (attempt: BookingAttempt) => void
  },
): Promise<BookingStart> {
  if (steps.digits.length >= 3) {
    let check: { warned: boolean }
    try {
      check = await steps.check(steps.digits)
    } catch {
      return 'checkFailed'
    }
    if (!steps.isOpen()) return 'closed'
    if (check.warned && !(await steps.confirmWarned())) return 'declined'
  }
  if (!steps.isOpen()) return 'closed'
  if (!steps.keep(attempt)) return 'notKept'
  steps.send(attempt)
  return 'sent'
}
