import type { BookingStatus, DepositStatus } from '../types/booking'

/** Each booking status's name in the interface. */
export const statusKeys: Record<BookingStatus, string> = {
  pending: 'common.pending',
  confirmed: 'common.confirmed',
  checked_in: 'common.checkedIn',
  checked_out: 'common.checkedOut',
  completed: 'common.completed',
  cancelled: 'common.cancelled',
}

/** Each deposit status's name in the interface. */
export const depositStatusKeys: Record<DepositStatus, string> = {
  pending: 'bookings.deposits.status.pending',
  paid: 'bookings.deposits.status.paid',
  returned: 'bookings.deposits.status.returned',
  held: 'bookings.deposits.status.held',
  partially_held: 'bookings.deposits.status.partiallyHeld',
}

/** The question before a status changes. A guest let in or out cannot be undone. */
export const stepAskKeys: Partial<Record<BookingStatus, string>> = {
  confirmed: 'bookings.steps.confirmAsk',
  checked_in: 'bookings.steps.checkInAsk',
  checked_out: 'bookings.steps.checkOutAsk',
  completed: 'bookings.steps.completeAsk',
}
