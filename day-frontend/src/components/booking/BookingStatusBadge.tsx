import type { BookingStatus } from '../../types/booking'

const statusStyles: Record<BookingStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  confirmed: 'bg-blue-100 text-blue-700',
  checked_in: 'bg-emerald-100 text-emerald-700',
  checked_out: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

const statusLabels: Record<BookingStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  checked_out: 'Checked Out',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export default function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  )
}
