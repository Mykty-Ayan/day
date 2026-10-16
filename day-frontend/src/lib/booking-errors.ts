import { isAxiosError } from 'axios'

type Translate = (key: string) => string

export type BookingFieldError =
  | { field: 'check_in' | 'check_out' | 'property_id'; message: string }
  | null

function extractApiErrorMessage(error: unknown): string | null {
  if (isAxiosError(error)) {
    const payload = error.response?.data as { detail?: unknown; message?: unknown } | undefined
    const detail = typeof payload?.detail === 'string' ? payload.detail : null
    const message = typeof payload?.message === 'string' ? payload.message : null
    if (detail) return detail
    if (message) return message
  }

  if (error instanceof Error && error.message) return error.message
  return null
}

function normalizeMessage(value: string): string {
  return value.trim().toLowerCase()
}

export function getBookingApiErrorMessage(error: unknown, t: Translate): string | null {
  const raw = extractApiErrorMessage(error)
  if (!raw) return null

  const normalized = normalizeMessage(raw)
  if (normalized.includes('date range overlaps with existing booking')) {
    return t('bookings.validation.dateRangeOverlap')
  }
  if (normalized.includes('dates are blocked')) {
    return t('bookings.validation.datesBlocked')
  }
  if (normalized.includes('dates have bookings')) {
    return t('properties.blocks.hasBookings')
  }
  if (normalized.includes('check-out must be after check-in')) {
    return t('bookings.validation.checkOutAfterCheckIn')
  }
  if (normalized.includes('check-in and check-out dates are required')) {
    return t('bookings.validation.checkInRequired')
  }
  if (normalized.includes('property is not active')) {
    return t('bookings.validation.propertyUnavailable')
  }
  if (normalized.includes('property not found')) {
    return t('bookings.validation.propertyUnavailable')
  }
  if (normalized.includes('booking not found')) {
    return t('bookings.notFound')
  }

  return raw
}

export function getBookingFieldError(error: unknown, t: Translate): BookingFieldError {
  const raw = extractApiErrorMessage(error)
  if (!raw) return null

  const normalized = normalizeMessage(raw)
  if (
    normalized.includes('date range overlaps with existing booking') ||
    normalized.includes('dates are blocked') ||
    normalized.includes('check-out must be after check-in')
  ) {
    return { field: 'check_out', message: getBookingApiErrorMessage(error, t) ?? t('bookings.failedUpdate') }
  }
  if (normalized.includes('check-in and check-out dates are required')) {
    return { field: 'check_in', message: t('bookings.validation.checkInRequired') }
  }
  if (normalized.includes('property is not active') || normalized.includes('property not found')) {
    return { field: 'property_id', message: getBookingApiErrorMessage(error, t) ?? t('bookings.validation.propertyUnavailable') }
  }

  return null
}

/** One stay rule of the apartment a booking breaks (see the property's rules). */
export interface StayRuleBreach {
  rule: 'min_nights' | 'max_nights' | 'buffer_hours' | 'min_lead_hours'
  limit: number
  actual: number
}

/** The broken stay rules of a refused booking (422, code "stay_rules"), or null
 *  for any other error. The same request with override_rules books it anyway. */
export function stayRuleBreaches(error: unknown): StayRuleBreach[] | null {
  if (!isAxiosError(error)) return null
  const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail
  if (typeof detail !== 'object' || detail === null) return null
  const { code, breaches } = detail as { code?: unknown; breaches?: unknown }
  return code === 'stay_rules' && Array.isArray(breaches) ? (breaches as StayRuleBreach[]) : null
}

export function stayRuleText(
  breach: StayRuleBreach,
  t: (key: string, values?: Record<string, unknown>) => string,
): string {
  return t(`bookings.stayRules.${breach.rule}`, { limit: breach.limit, actual: breach.actual })
}

/** A booking request the stay rules refused, kept to send again with override_rules. */
export interface RulesRefusal<T> {
  payload: T
  breaches: StayRuleBreach[]
}

/** The breaches to show: only while the form would still send what was refused.
 *  A change since then (even one made while the answer was on its way) is a new
 *  booking for the server to check, not one the operator agreed to. */
export function currentBreaches<T>(refusal: RulesRefusal<T> | null, payload: T): StayRuleBreach[] | null {
  if (!refusal) return null
  return JSON.stringify(refusal.payload) === JSON.stringify(payload) ? refusal.breaches : null
}
