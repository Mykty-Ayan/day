import { useTranslation } from 'react-i18next'
import type { BookingStatus } from '../../types/booking'
import { statusKeys } from '../../lib/booking-status'
import { intlLocale } from '../../pages/miniapp/format'
import { Badge, type BadgeTone } from '../ui/badge'

const TONES: Record<BookingStatus, BadgeTone> = {
  pending: 'neutral',
  confirmed: 'accent',
  checked_in: 'success',
  checked_out: 'warning',
  completed: 'success',
  cancelled: 'danger',
}

/** A booking's status. A hold from the site or a link waits for its deposit until a
 *  deadline and then cancels itself: the badge says until when, or that the time is out. */
export default function BookingStatusBadge({ status, expiresAt }: { status: BookingStatus; expiresAt?: string | null }) {
  const { t, i18n } = useTranslation()
  if (status === 'pending' && expiresAt) {
    const until = new Date(expiresAt)
    // The time the page was drawn: a list drawn after the deadline says so.
    const ranOut = until.getTime() <= new Date().getTime()
    const time = new Intl.DateTimeFormat(intlLocale(i18n.language), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(until)
    return <Badge tone={ranOut ? 'danger' : 'warning'}>{ranOut ? t('bookings.holdRanOut') : t('bookings.holdUntil', { time })}</Badge>
  }
  return <Badge tone={TONES[status]}>{t(statusKeys[status])}</Badge>
}
