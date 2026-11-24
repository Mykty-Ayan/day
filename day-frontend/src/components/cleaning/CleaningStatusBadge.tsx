import { useTranslation } from 'react-i18next'
import type { CleaningStatus } from '../../types/cleaning'
import { Badge, type BadgeTone } from '../ui/badge'

const TONES: Record<CleaningStatus, BadgeTone> = {
  pending: 'neutral',
  assigned: 'accent',
  in_progress: 'warning',
  done: 'success',
  verified: 'success',
}

const KEYS: Record<CleaningStatus, string> = {
  pending: 'cleaning.status.pending',
  assigned: 'cleaning.status.assigned',
  in_progress: 'cleaning.status.inProgress',
  done: 'cleaning.status.done',
  verified: 'cleaning.status.verified',
}

export default function CleaningStatusBadge({ status }: { status: CleaningStatus }) {
  const { t } = useTranslation()
  return <Badge tone={TONES[status]}>{t(KEYS[status])}</Badge>
}
