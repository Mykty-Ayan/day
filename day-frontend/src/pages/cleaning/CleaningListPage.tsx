import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import CleaningStatusBadge from '../../components/cleaning/CleaningStatusBadge'
import CleaningTypeBadge from '../../components/cleaning/CleaningTypeBadge'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { useCleaningTasks } from '../../hooks/useCleaning'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import type { CleaningStatus } from '../../types/cleaning'
// Object, kind, status, when, who: one grid for the header and every row on a wide screen.
const COLUMNS = 'lg:grid lg:grid-cols-[minmax(0,1.4fr)_9rem_9rem_minmax(0,1fr)_minmax(0,1fr)_1rem] lg:items-center lg:gap-4'
const ADD =
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface-card px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-page'

/** Every cleaning, by status: a table on a wide screen, one card per cleaning on a phone; no switch. */
export default function CleaningListPage() {
  const { t, i18n } = useTranslation()
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

  const { data, isLoading, isError, refetch } = useCleaningTasks({
    page,
    per_page: 20,
    status: statusFilter === 'all' ? undefined : statusFilter,
  })

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">
          {t('cleaning.cleaningTasks')}
          {data && statusFilter === 'all' && data.total > 0 && (
            <span className="ml-2 font-semibold tabular-nums text-ink-muted">{data.total}</span>
          )}
        </h1>
        <Link to="/cleaning/new" className={ADD}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('cleaning.newTask')}
        </Link>
      </div>

      {/* A phone scrolls the statuses sideways rather than wrapping them. */}
      <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ToggleGroup
          type="single"
          className="w-max max-w-none flex-nowrap"
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

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="mb-1 text-sm font-semibold text-ink">{t('common.errorTitle')}</p>
          <p className="mb-4 text-sm text-ink-muted">{t('common.errorLoading')}</p>
          <Button variant="secondary" onClick={() => refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line px-5 py-14 text-center">
          <p className="text-sm text-ink-muted">{t('cleaning.noCleaningTasks')}</p>
          <Link to="/cleaning/new" className="text-sm font-semibold text-accent-ink hover:underline">
            {t('cleaning.createFirst')}
          </Link>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface-card">
            <div className={`hidden border-b border-line px-5 py-3 text-xs font-semibold text-ink-muted ${COLUMNS}`} aria-hidden="true">
              <span>{t('cleaning.property')}</span>
              <span>{t('cleaning.type')}</span>
              <span>{t('common.status')}</span>
              <span>{t('cleaning.scheduled')}</span>
              <span>{t('cleaning.cleaner')}</span>
              <span />
            </div>
            <ul className="divide-y divide-line">
              {data.items.map((task) => {
                const name = task.property_internal_name || task.property_name || t('common.unknown')
                const who = task.cleaner_name || (task.cleaner_id ? t('cleaning.assignedCleaner') : t('cleaning.unassigned'))
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      aria-label={name}
                      onClick={() => navigate({ to: '/cleaning/$taskId', params: { taskId: task.id } })}
                      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-5 py-3.5 text-left transition-colors hover:bg-surface-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${COLUMNS}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{name}</span>
                        {task.property_name && task.property_name !== name && (
                          <span className="block truncate text-xs text-ink-muted">{task.property_name}</span>
                        )}
                      </span>
                      {/* On a phone the status sits by the name. */}
                      <span className="justify-self-end lg:hidden">
                        <CleaningStatusBadge status={task.status} />
                      </span>
                      <span className="col-span-2 flex flex-wrap items-center gap-2 lg:col-span-1">
                        <CleaningTypeBadge type={task.type} />
                        <span className="text-xs text-ink-muted lg:hidden">
                          {formatScheduled(task.scheduled_date, task.scheduled_time, i18n.language)} · {who}
                        </span>
                      </span>
                      <span className="hidden lg:block">
                        <CleaningStatusBadge status={task.status} />
                      </span>
                      <span className="hidden text-sm text-ink lg:block">
                        {formatScheduled(task.scheduled_date, task.scheduled_time, i18n.language)}
                      </span>
                      <span className={`hidden truncate text-sm lg:block ${task.cleaner_id ? 'text-ink' : 'text-ink-muted'}`}>{who}</span>
                      <ChevronRight className="hidden h-4 w-4 text-ink-muted lg:block" aria-hidden="true" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          {data.pages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label={t('common.previous')}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-ink hover:bg-surface-page disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-3 text-xs font-semibold text-ink-muted">{t('common.page', { current: data.page, total: data.pages })}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                disabled={page >= data.pages}
                aria-label={t('common.next')}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-ink hover:bg-surface-page disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
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
