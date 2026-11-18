import { useTranslation } from 'react-i18next'
import type { CleaningType } from '../../types/cleaning'
import { Badge } from '../ui/badge'

const KEYS: Record<CleaningType, string> = {
  post_checkout: 'cleaning.types.postCheckout',
  mid_stay: 'cleaning.types.midStay',
  on_demand: 'cleaning.types.onDemand',
}

/** What kind of cleaning: a fact, not a state, so one quiet colour for all three. */
export default function CleaningTypeBadge({ type }: { type: CleaningType }) {
  const { t } = useTranslation()
  return <Badge>{t(KEYS[type])}</Badge>
}
