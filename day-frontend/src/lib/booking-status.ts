import type { BookingStatus } from '../types/booking'

/** The question before a status changes. A guest let in or out cannot be undone. */
export const stepAskKeys: Partial<Record<BookingStatus, string>> = {
  confirmed: 'bookings.steps.confirmAsk',
  checked_in: 'bookings.steps.checkInAsk',
  checked_out: 'bookings.steps.checkOutAsk',
  completed: 'bookings.steps.completeAsk',
}
