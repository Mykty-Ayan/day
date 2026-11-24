/** What the booking screen leads to: what stands in the way of the next step, and
 *  which step comes first once the guest has left. */

import type { BookingDeposit, BookingStatus } from '../types/booking'

export type StepWarning = 'debt' | 'depositUnpaid'

/** What the operator should know before pressing check-in or check-out. It warns and
 *  never stops: a guest may pay on arrival. usualDeposit: what the flat normally takes. */
export function stepWarnings(
  status: BookingStatus,
  owes: number,
  deposits: BookingDeposit[],
  usualDeposit: number,
): StepWarning[] {
  if (status !== 'confirmed' && status !== 'checked_in') return []
  const warnings: StepWarning[] = owes > 0 ? ['debt'] : []
  if (status !== 'confirmed') return warnings
  const unpaid = deposits.some((deposit) => deposit.status === 'pending')
  return unpaid || (deposits.length === 0 && usualDeposit > 0) ? [...warnings, 'depositUnpaid'] : warnings
}

export type MainStep = 'status' | 'takePayment' | 'returnDeposit'

/** Once the guest has left, money comes first: their debt, then their deposit. */
export function mainStep(status: BookingStatus, owes: number, deposits: BookingDeposit[]): MainStep {
  if (!['checked_out', 'completed', 'cancelled'].includes(status)) return 'status'
  if (owes > 0) return 'takePayment'
  return deposits.some((deposit) => deposit.status === 'paid') ? 'returnDeposit' : 'status'
}
