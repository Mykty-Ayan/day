import type { CleaningType } from '../../types/cleaning'

const typeStyles: Record<CleaningType, string> = {
  post_checkout: 'bg-purple-100 text-purple-700',
  mid_stay: 'bg-sky-100 text-sky-700',
  on_demand: 'bg-orange-100 text-orange-700',
}

const typeLabels: Record<CleaningType, string> = {
  post_checkout: 'Post Checkout',
  mid_stay: 'Mid Stay',
  on_demand: 'On Demand',
}

export default function CleaningTypeBadge({ type }: { type: CleaningType }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${typeStyles[type]}`}
    >
      {typeLabels[type]}
    </span>
  )
}
