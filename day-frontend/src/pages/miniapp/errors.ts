/**
 * The sentence the Mini App shows when a request fails.
 *
 * FastAPI answers a validation error with a list of objects; rendering that in
 * JSX throws and takes the whole app down. Other answers are English sentences
 * written for developers. Neither belongs in front of an operator on a call.
 */

import type { Translate } from './messages'

const KNOWN: ReadonlyArray<readonly [string, string]> = [
  ['date range overlaps with existing booking', 'bookings.validation.dateRangeOverlap'],
  ['check-out must be after check-in', 'bookings.validation.checkOutAfterCheckIn'],
  ['property is not active', 'bookings.validation.propertyUnavailable'],
  ['property not found', 'bookings.validation.propertyUnavailable'],
  ['booking not found', 'bookings.notFound'],
  ['insufficient permissions', 'miniapp.errors.forbidden'],
  ['cannot transition from', 'miniapp.errors.staleStatus'],
  ['no pricing configuration', 'miniapp.errors.noPrice'],
  ['already has an open deposit', 'miniapp.deposit.alreadyTaken'],
  ['assistant is not configured', 'miniapp.errors.assistantOff'],
  ['model returned', 'miniapp.errors.assistantOff'],
]

export function errorText(error: unknown, fallback: string, t: Translate): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } } | null)?.response?.data?.detail
  if (detail === undefined || detail === null) return fallback
  if (typeof detail !== 'string') return t('miniapp.errors.invalid')

  const lower = detail.toLowerCase()
  const known = KNOWN.find(([needle]) => lower.includes(needle))
  if (known) return t(known[1])
  // The server writes some answers in Russian already; English ones are for developers.
  return /[а-яё]/i.test(detail) ? detail : fallback
}
