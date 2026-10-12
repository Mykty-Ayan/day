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
  /** The number of the latest send: a late answer to an earlier one is told apart. */
  call?: number
}

// One per company on a phone: until it is settled, no other booking starts,
// whichever flat. Per company, because a chat can be relinked to another one.
const key = (company: string) => `day.miniapp.booking.${company}`

/** The company of the signed-in session, read from the access token. */
export function companyFromToken(token: string | null): string | null {
  try {
    const part = token?.split('.')[1]
    if (!part) return null
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { company_id?: unknown }
    return typeof payload.company_id === 'string' ? payload.company_id : null
  } catch {
    return null
  }
}

/** The attempt found on the phone. Its first answer may never have been seen (the
 *  app was closed mid-request), so it counts as possibly made. */
export function loadBookingAttempt(storage: AttemptStore | undefined, company: string): BookingAttempt | null {
  const stored = loadStored<BookingAttempt>(storage, key(company))
  return stored ? { ...stored, uncertain: true } : null
}

export function saveBookingAttempt(
  storage: AttemptStore | undefined,
  company: string,
  attempt: BookingAttempt | null,
): boolean {
  return saveStored(storage, key(company), attempt)
}

/** The attempt exactly as the last send kept it, to judge that send's failure. */
export function storedBookingAttempt(storage: AttemptStore | undefined, company: string): BookingAttempt | null {
  return loadStored<BookingAttempt>(storage, key(company))
}

/** Whether a failed send is the latest one of the attempt kept on the phone. Only
 *  then may its failure change the attempt: a late refusal of the first send
 *  must not drop a retry whose answer was lost. */
export function latestBookingCall(stored: BookingAttempt | null, failed: BookingAttempt): stored is BookingAttempt {
  return stored?.key === failed.key && stored.call === failed.call
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
