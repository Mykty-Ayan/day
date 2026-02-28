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
