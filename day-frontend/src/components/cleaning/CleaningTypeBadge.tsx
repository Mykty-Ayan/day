import { useTranslation } from 'react-i18next'
import type { CleaningType } from '../../types/cleaning'

const typeStyles: Record<CleaningType, string> = {
  post_checkout: 'bg-purple-100 text-purple-700',
  mid_stay: 'bg-sky-100 text-sky-700',
  on_demand: 'bg-orange-100 text-orange-700',
}

export default function CleaningTypeBadge({ type }: { type: CleaningType }) {
  const { t } = useTranslation()

  const typeLabels: Record<CleaningType, string> = {
    post_checkout: t('cleaning.types.postCheckout'),
    mid_stay: t('cleaning.types.midStay'),
    on_demand: t('cleaning.types.onDemand'),
  }

  return (
    <span
      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${typeStyles[type]}`}
    >
      {typeLabels[type]}
    </span>
  )
}
