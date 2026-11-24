import { useTranslation } from 'react-i18next'
import type { PropertyStatus } from '../../types/property'
import { Badge, type BadgeTone } from '../ui/badge'

const TONES: Record<PropertyStatus, BadgeTone> = {
  active: 'success',
  paused: 'warning',
  archived: 'neutral',
  new: 'accent',
}

/** One flat's status, said of one flat: "Active", not the list filter's "Active ones". */
export default function StatusBadge({ status }: { status: PropertyStatus }) {
  const { t } = useTranslation()
  return <Badge tone={TONES[status]}>{t(`properties.statusOne.${status}`)}</Badge>
}
