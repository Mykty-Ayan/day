import { motion } from 'framer-motion'
import { Plus, SprayCan } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'

import CleaningStatusBadge from '../../components/cleaning/CleaningStatusBadge'
import CleaningTypeBadge from '../../components/cleaning/CleaningTypeBadge'
import Button from '../../components/ui/Button'
import { useCleaningTasks } from '../../hooks/useCleaning'
import type { CleaningStatus } from '../../types/cleaning'

const STATUS_TABS: { label: string; value: CleaningStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Assigned', value: 'assigned' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Done', value: 'done' },
  { label: 'Verified', value: 'verified' },
]

export default function CleaningListPage() {
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<CleaningStatus | 'all'>(
    'all',
  )
  const [page, setPage] = useState(1)

  const { data, isLoading } = useCleaningTasks({
    page,
    per_page: 20,
    status: statusFilter === 'all' ? undefined : statusFilter,
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-6 max-w-7xl mx-auto w-full"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <SprayCan className="w-6 h-6 text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900">Cleaning Tasks</h1>
        </div>
        <Link to="/cleaning/new">
          <Button className="min-w-[168px]">
            <Plus className="w-4 h-4" />
            New Task
          </Button>
        </Link>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6 w-full overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => {
              setStatusFilter(tab.value)
              setPage(1)
            }}
            className={`basis-0 grow min-w-[120px] px-4 py-2 rounded-lg text-sm font-medium text-center transition-all whitespace-nowrap ${
              statusFilter === tab.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden min-h-[220px]">
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : !data?.items.length ? (
          <div className="text-center py-12 text-gray-400">
            No cleaning tasks found
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Property</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Scheduled</th>
                  <th className="px-6 py-3">Cleaner</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((task, i) => (
                  <motion.tr
                    key={task.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.02 }}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() =>
                      navigate({
                        to: '/cleaning/$taskId',
                        params: { taskId: task.id },
                      })
                    }
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-sm text-gray-900">
                        {task.property_name || 'Unknown'}
                      </div>
                      <div className="text-xs text-gray-400">
                        {task.property_internal_name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <CleaningTypeBadge type={task.type} />
                    </td>
                    <td className="px-6 py-4">
                      <CleaningStatusBadge status={task.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {task.scheduled_date || '—'}
                      {task.scheduled_time ? ` ${task.scheduled_time}` : ''}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {task.cleaner_id
                        ? task.cleaner_id.slice(0, 8) + '...'
                        : 'Unassigned'}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Pagination */}
      {!isLoading && Boolean(data?.items.length) && data && data.pages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: data.pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-lg text-sm font-medium ${
                page === p
                  ? 'bg-black text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </motion.div>
  )
}
