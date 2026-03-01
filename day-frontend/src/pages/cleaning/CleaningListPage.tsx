import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import CleaningStatusBadge from '../../components/cleaning/CleaningStatusBadge'
import CleaningTypeBadge from '../../components/cleaning/CleaningTypeBadge'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { useCleaningTasks } from '../../hooks/useCleaning'
import Spinner from '../../components/ui/Spinner'
import type { CleaningStatus } from '../../types/cleaning'

export default function CleaningListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<CleaningStatus | 'all'>('all')
  const [page, setPage] = useState(1)

  const STATUS_TABS: { label: string; value: CleaningStatus | 'all' }[] = [
    { label: t('common.all'), value: 'all' },
    { label: t('cleaning.status.pending'), value: 'pending' },
    { label: t('cleaning.status.assigned'), value: 'assigned' },
    { label: t('cleaning.status.inProgress'), value: 'in_progress' },
    { label: t('cleaning.status.done'), value: 'done' },
    { label: t('cleaning.status.verified'), value: 'verified' },
  ]

  const { data, isLoading } = useCleaningTasks({
    page,
    per_page: 20,
    status: statusFilter === 'all' ? undefined : statusFilter,
  })

  return (
    <div className="p-6 max-w-7xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">{t('cleaning.cleaningTasks')}</h1>
          <Link to="/cleaning/new">
            <motion.button
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 bg-black text-white hover:bg-gray-800 rounded-xl px-6 py-2.5 font-semibold shadow-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              {t('cleaning.newTask')}
            </motion.button>
          </Link>
        </div>

        <div className="flex flex-col gap-3 mb-6">
          <ToggleGroup
            type="single"
            value={statusFilter}
            onValueChange={(value) => {
              if (!value) return
              setStatusFilter(value as CleaningStatus | 'all')
              setPage(1)
            }}
            className="self-start"
          >
            {STATUS_TABS.map((tab) => (
              <ToggleGroupItem key={tab.value} value={tab.value}>
                {tab.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {isLoading ? (
          <Spinner />
        ) : !data || data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-sm text-gray-500 mb-4">{t('cleaning.noCleaningTasks')}</p>
            <Link to="/cleaning/new">
              <motion.button
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 bg-black text-white hover:bg-gray-800 rounded-xl px-6 py-2.5 font-semibold shadow-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('cleaning.createFirst')}
              </motion.button>
            </Link>
          </div>
        ) : (
          <>
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('cleaning.property')}</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('cleaning.type')}</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('common.status')}</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('cleaning.scheduled')}</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('cleaning.cleaner')}</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((task, i) => (
                    <motion.tr
                      key={task.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.02 }}
                      onClick={() =>
                        navigate({
                          to: '/cleaning/$taskId',
                          params: { taskId: task.id },
                        })
                      }
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0 bg-blue-500" />
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-medium text-gray-900 truncate max-w-[220px]">
                              {task.property_name || task.property_internal_name || 'Unknown'}
                            </span>
                            <span className="text-xs text-gray-400 truncate max-w-[220px]">
                              {task.property_internal_name || '—'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <CleaningTypeBadge type={task.type} />
                      </td>
                      <td className="px-4 py-3">
                        <CleaningStatusBadge status={task.status} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">
                          {formatScheduled(task.scheduled_date, task.scheduled_time)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">
                          {task.cleaner_id ? `${task.cleaner_id.slice(0, 8)}...` : t('cleaning.unassigned')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.pages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </motion.button>
                <span className="text-xs font-bold text-gray-500 px-3">
                  {t('common.page', { current: data.page, total: data.pages })}
                </span>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                  disabled={page >= data.pages}
                  className="p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </motion.button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  )
}

function formatScheduled(date: string | null, time: string | null): string {
  if (!date) return '—'

  const parsedDate = new Date(date)
  const displayDate = Number.isNaN(parsedDate.getTime())
    ? date
    : parsedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  if (!time) return displayDate

  const displayTime = time.slice(0, 5)
  return `${displayDate}, ${displayTime}`
}
