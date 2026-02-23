import { useTranslation } from 'react-i18next'
import type { PropertyStatus } from '../../types/property'

const statusStyles: Record<PropertyStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  archived: 'bg-gray-100 text-gray-600',
  new: 'bg-blue-100 text-blue-700',
}

const statusKeys: Record<PropertyStatus, string> = {
  active: 'common.active',
  paused: 'common.paused',
  archived: 'common.archived',
  new: 'common.new',
}

interface Props {
  status: PropertyStatus
}

export default function StatusBadge({ status }: Props) {
  const { t } = useTranslation()
  return (
    <span
      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${statusStyles[status]}`}
    >
      {t(statusKeys[status])}
    </span>
  )
}
