import { format, parseISO, type Locale } from 'date-fns'
import type { TimeSeriesPoint } from '../../types/analytics'

/** A bar's period in the app's language: the server names it in English («Nov 01», «Nov 2026»).
 *  A month is named by its month, a day or a week by its first day. */
export function periodLabel(point: TimeSeriesPoint, locale: Locale): string {
  if (!point.period_start) return point.period_label
  const day = parseISO(point.period_start)
  return /^[A-Za-z]{3,}\.? \d{4}$/.test(point.period_label.trim()) ? format(day, 'LLL yyyy', { locale }) : format(day, 'd MMM', { locale })
}
