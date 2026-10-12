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

export { companyFromToken } from '../../lib/token'

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

export type BookingStart = 'sent' | 'checkFailed' | 'declined' | 'closed' | 'busy' | 'notKept'

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

/** Runs a read and a write of the company's attempt as one step. The windows of
 *  the app share the phone's storage, so without a shared lock two of them could
 *  both find no attempt and each book the guest into another flat. Without Web
 *  Locks (an old webview) it runs unlocked, as one window always did. */
export function withBookingLock<T>(
  company: string,
  run: () => T | PromiseLike<T>,
  locks: AttemptLocks | undefined = webLocks(),
): Promise<T> {
  return locks ? locks.request(key(company), run) : Promise.resolve().then(run)
}

/** The steps after the press. The blacklist is asked for the phone as it was
 *  pressed (the server does not ask it); a sheet closed meanwhile books nothing;
 *  the attempt is kept on the phone before it is sent, and only if no other
 *  window kept one meanwhile (claim does both under the lock). */
export async function startBooking(
  attempt: BookingAttempt,
  steps: {
    digits: string
    check: (digits: string) => Promise<{ warned: boolean }>
    confirmWarned: () => Promise<boolean>
    isOpen: () => boolean
    claim: (attempt: BookingAttempt) => Promise<'kept' | 'busy' | 'notKept' | 'closed'>
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
  const claimed = await steps.claim(attempt)
  if (claimed !== 'kept') return claimed
  steps.send(attempt)
  return 'sent'
}
