import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import CleaningStatusBadge from '../../components/cleaning/CleaningStatusBadge'
import CleaningTypeBadge from '../../components/cleaning/CleaningTypeBadge'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { useCleaningTasks } from '../../hooks/useCleaning'
import Spinner from '../../components/ui/Spinner'
import type { CleaningStatus } from '../../types/cleaning'
import type { ViewMode } from '../../types/view-mode'
import { isViewMode } from '../../types/view-mode'

const CLEANING_LIST_VIEW_MODE_STORAGE_KEY = 'day:cleaning:list-view-mode'

function readInitialViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'table'

  try {
    const stored = window.localStorage.getItem(CLEANING_LIST_VIEW_MODE_STORAGE_KEY)
    if (isViewMode(stored)) {
      return stored
    }
  } catch {
    // Ignore storage errors and fallback to viewport-aware default.
  }

  return window.matchMedia('(max-width: 1023px)').matches ? 'cards' : 'table'
}

export default function CleaningListPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<CleaningStatus | 'all'>('all')
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<ViewMode>(() => readInitialViewMode())

  const STATUS_TABS: { label: string; value: CleaningStatus | 'all' }[] = [
    { label: t('common.all'), value: 'all' },
    { label: t('cleaning.status.pending'), value: 'pending' },
    { label: t('cleaning.status.assigned'), value: 'assigned' },
    { label: t('cleaning.status.inProgress'), value: 'in_progress' },
    { label: t('cleaning.status.done'), value: 'done' },
    { label: t('cleaning.status.verified'), value: 'verified' },
  ]
  const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
    { value: 'cards', label: t('common.cards') },
    { value: 'table', label: t('common.table') },
  ]

  const { data, isLoading, isError, refetch } = useCleaningTasks({
    page,
    per_page: 20,
    status: statusFilter === 'all' ? undefined : statusFilter,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(CLEANING_LIST_VIEW_MODE_STORAGE_KEY, viewMode)
    } catch {
      // Ignore storage write errors.
    }
  }, [viewMode])

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-7xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold text-gray-900">{t('cleaning.cleaningTasks')}</h1>
          <Link to="/cleaning/new" className="w-full sm:w-auto">
            <motion.button
              whileTap={{ scale: 0.97 }}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-2.5 font-semibold text-white shadow-lg transition-colors hover:bg-gray-800 sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              {t('cleaning.newTask')}
            </motion.button>
          </Link>
        </div>

        <div className="flex flex-col gap-3 mb-6">
          <div className="w-full overflow-x-auto">
            <ToggleGroup
              type="single"
              value={statusFilter}
              onValueChange={(value) => {
                if (!value) return
                setStatusFilter(value as CleaningStatus | 'all')
                setPage(1)
              }}
            >
              {STATUS_TABS.map((tab) => (
                <ToggleGroupItem key={tab.value} value={tab.value}>
                  {tab.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="w-full overflow-x-auto">
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(value) => {
                if (!value) return
                setViewMode(value as ViewMode)
              }}
            >
              {VIEW_OPTIONS.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value}>
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>

        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="mb-1 text-sm font-semibold text-gray-900">{t('common.errorTitle')}</p>
            <p className="mb-4 text-sm text-gray-500">{t('common.errorLoading')}</p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => refetch()}
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-2.5 font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              {t('common.retry')}
            </motion.button>
          </div>
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
            {viewMode === 'cards' ? (
              <div className="space-y-3">
                {data.items.map((task, i) => (
                  <motion.button
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
                    type="button"
                    className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-gray-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {task.property_name || task.property_internal_name || t('common.unknown')}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {task.property_internal_name || '—'}
                        </p>
                      </div>
                      <CleaningStatusBadge status={task.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-600 sm:grid-cols-2">
                      <span>{formatScheduled(task.scheduled_date, task.scheduled_time, i18n.language)}</span>
                      <span className="sm:text-right">
                        {task.cleaner_name || (task.cleaner_id ? t('cleaning.assignedCleaner') : t('cleaning.unassigned'))}
                      </span>
                      <span className="sm:col-span-2">
                        <CleaningTypeBadge type={task.type} />
                      </span>
                    </div>
                  </motion.button>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="w-full overflow-x-auto">
                  <table className="w-full min-w-[680px]">
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
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              navigate({ to: '/cleaning/$taskId', params: { taskId: task.id } })
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          aria-label={task.property_name || task.property_internal_name || t('common.unknown')}
                          className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black/20"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full shrink-0 bg-blue-500" />
                              <div className="flex flex-col min-w-0">
                                <span className="text-sm font-medium text-gray-900 truncate max-w-[220px]">
                                  {task.property_name || task.property_internal_name || t('common.unknown')}
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
                              {formatScheduled(task.scheduled_date, task.scheduled_time, i18n.language)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600">
                              {task.cleaner_name || (task.cleaner_id ? t('cleaning.assignedCleaner') : t('cleaning.unassigned'))}
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
              </div>
            )}

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

function formatScheduled(date: string | null, time: string | null, locale: string): string {
  if (!date) return '—'

  const parsedDate = new Date(date)
  const displayDate = Number.isNaN(parsedDate.getTime())
    ? date
    : parsedDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' })

  if (!time) return displayDate

  const displayTime = time.slice(0, 5)
  return `${displayDate}, ${displayTime}`
}
