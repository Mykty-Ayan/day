import type { CleaningStatus } from '../../types/cleaning'

const statusStyles: Record<CleaningStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  assigned: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  done: 'bg-emerald-100 text-emerald-700',
  verified: 'bg-green-100 text-green-700',
}

const statusLabels: Record<CleaningStatus, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  done: 'Done',
  verified: 'Verified',
}

export default function CleaningStatusBadge({
  status,
}: {
  status: CleaningStatus
}) {
  return (
    <span
      className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  )
}
