import { useTranslation } from 'react-i18next'
import type { BookingStatus } from '../../types/booking'
import { statusKeys } from '../../lib/booking-status'
import { Badge, type BadgeTone } from '../ui/badge'

const TONES: Record<BookingStatus, BadgeTone> = {
  pending: 'neutral',
  confirmed: 'accent',
  checked_in: 'success',
  checked_out: 'warning',
  completed: 'success',
  cancelled: 'danger',
}

export default function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const { t } = useTranslation()
  return <Badge tone={TONES[status]}>{t(statusKeys[status])}</Badge>
}
