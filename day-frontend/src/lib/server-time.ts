/**
 * Day stores instants in UTC and sends them without a zone, so the browser read
 * 19:39 UTC as 19:39 local: after midnight in Almaty a payment landed on yesterday.
 * Check-ins are not instants: they stay as they are, and never pass through here.
 */
export function serverTime(value: string): Date {
  return new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`)
}
