import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Home,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  SprayCan,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import Spinner from '../../components/ui/Spinner'
import LoadError from '../../components/ui/LoadError'
import { useCleaningTasks } from '../../hooks/useCleaning'
import type { CleaningTask, CleaningStatus, CleaningType } from '../../types/cleaning'

function getTodayDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function TaskCard({ task }: { task: CleaningTask }) {
  const { t } = useTranslation()

  const statusConfig: Record<CleaningStatus, { label: string; color: string; bg: string; icon: typeof Clock }> = {
    pending: { label: t('cleaning.status.pending'), color: 'text-ink', bg: 'bg-surface-page', icon: Clock },
    assigned: { label: t('cleaning.status.assigned'), color: 'text-accent-ink', bg: 'bg-accent-soft', icon: AlertCircle },
    in_progress: { label: t('cleaning.status.inProgress'), color: 'text-warning', bg: 'bg-warning-soft', icon: SprayCan },
    done: { label: t('cleaning.status.done'), color: 'text-success', bg: 'bg-success-soft', icon: CheckCircle2 },
    verified: { label: t('cleaning.status.verified'), color: 'text-success', bg: 'bg-success-soft', icon: CheckCircle2 },
  }

  const typeLabels: Record<CleaningType, string> = {
    post_checkout: t('cleaning.types.postCheckout'),
    mid_stay: t('cleaning.types.midStay'),
    on_demand: t('cleaning.types.onDemand'),
  }

  const config = statusConfig[task.status]
  const Icon = config.icon

  return (
    <Link
      to="/cleaner/$taskId"
      params={{ taskId: task.id }}
      className="block"
    >
      <motion.div
        whileTap={{ scale: 0.98 }}
        className="bg-surface-card border border-line rounded-2xl p-4 active:bg-surface-page transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-12 h-12 rounded-xl ${config.bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-5 h-5 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-ink truncate">
                {task.property_internal_name || task.property_name || t('common.unknown')}
              </p>
              <p className="text-xs text-ink-muted mt-0.5">
                {typeLabels[task.type]}
                {task.scheduled_time && ` ${t('cleaning.atTime', { time: task.scheduled_time })}`}
              </p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${config.bg} ${config.color}`}>
                {config.label}
              </span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-ink-muted/60 shrink-0 ml-2" />
        </div>
      </motion.div>
    </Link>
  )
}

export default function CleanerDashboardPage() {
  const { t, i18n } = useTranslation()
  const today = getTodayDateString()
  const { data, isLoading, isError, refetch } = useCleaningTasks({
    date_from: today,
    date_to: today,
  })

  const items = data?.items

  const tasks = useMemo(() => items ?? [], [items])

  const grouped = useMemo(() => {
    const active: CleaningTask[] = []
    const completed: CleaningTask[] = []
    for (const task of tasks) {
      if (task.status === 'done' || task.status === 'verified') {
        completed.push(task)
      } else {
        active.push(task)
      }
    }
    return { active, completed }
  }, [tasks])

  return (
    <div className="min-h-screen bg-surface-page">
      {/* Mobile header */}
      <div className="bg-surface-card border-b border-line px-4 pt-4 pb-3 safe-area-top">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <Home className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-ink">{t('cleaner.todaysTasks')}</h1>
            <p className="text-xs text-ink-muted">
              {new Date().toLocaleDateString(i18n.language, { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {/* Summary bar: no zeros when the list did not load */}
      {!isError && (
        <div className="px-4 py-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-surface-card rounded-xl p-3 border border-line text-center">
              <p className="text-lg font-bold text-ink">{tasks.length}</p>
              <p className="text-[10px] font-bold text-ink-muted uppercase">{t('cleaner.total')}</p>
            </div>
            <div className="bg-surface-card rounded-xl p-3 border border-line text-center">
              <p className="text-lg font-bold text-warning">{grouped.active.length}</p>
              <p className="text-[10px] font-bold text-ink-muted uppercase">{t('cleaner.active')}</p>
            </div>
            <div className="bg-surface-card rounded-xl p-3 border border-line text-center">
              <p className="text-lg font-bold text-success">{grouped.completed.length}</p>
              <p className="text-[10px] font-bold text-ink-muted uppercase">{t('cleaner.done')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="px-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <div className="py-6">
            <LoadError message={t('cleaner.loadFailed')} onRetry={() => refetch()} />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <CheckCircle2 className="w-12 h-12 text-line mb-3" />
            <p className="text-sm font-semibold text-ink-muted">{t('cleaner.noTasksForToday')}</p>
          </div>
        ) : (
          <>
            {/* Active tasks */}
            {grouped.active.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xs font-semibold text-ink-muted mb-3 px-1">
                  {t('cleaner.activeCount', { count: grouped.active.length })}
                </h2>
                <div className="space-y-3">
                  {grouped.active.map((task, i) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.05 }}
                    >
                      <TaskCard task={task} />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Completed tasks */}
            {grouped.completed.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-ink-muted mb-3 px-1">
                  {t('cleaner.completedCount', { count: grouped.completed.length })}
                </h2>
                <div className="space-y-3">
                  {grouped.completed.map((task, i) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.05 }}
                    >
                      <TaskCard task={task} />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface-card border-t border-line safe-area-bottom">
        <div className="flex items-center justify-around py-2">
          <Link
            to="/cleaner"
            className="flex flex-col items-center gap-1 px-4 py-2 min-w-[48px] min-h-[48px] justify-center"
          >
            <Home className="w-5 h-5 text-ink" />
            <span className="text-[10px] font-bold text-ink">{t('cleaner.tasks')}</span>
          </Link>
          <Link
            to="/cleaning"
            className="flex flex-col items-center gap-1 px-4 py-2 min-w-[48px] min-h-[48px] justify-center"
          >
            <SprayCan className="w-5 h-5 text-ink-muted" />
            <span className="text-[10px] font-bold text-ink-muted">{t('cleaner.all')}</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
