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
import { useCleaningTasks } from '../../hooks/useCleaning'
import type { CleaningTask, CleaningStatus } from '../../types/cleaning'

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
    pending: { label: t('cleaning.status.pending'), color: 'text-gray-700', bg: 'bg-gray-100', icon: Clock },
    assigned: { label: t('cleaning.status.assigned'), color: 'text-blue-700', bg: 'bg-blue-100', icon: AlertCircle },
    in_progress: { label: t('cleaning.status.inProgress'), color: 'text-amber-700', bg: 'bg-amber-100', icon: SprayCan },
    done: { label: t('cleaning.status.done'), color: 'text-green-700', bg: 'bg-green-100', icon: CheckCircle2 },
    verified: { label: t('cleaning.status.verified'), color: 'text-emerald-700', bg: 'bg-emerald-100', icon: CheckCircle2 },
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
        className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm active:bg-gray-50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-12 h-12 rounded-xl ${config.bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-5 h-5 ${config.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">
                {task.property_internal_name || task.property_name || 'Unknown Property'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {task.type.replace('_', ' ')}
                {task.scheduled_time && ` at ${task.scheduled_time}`}
              </p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${config.bg} ${config.color}`}>
                {config.label}
              </span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300 shrink-0 ml-2" />
        </div>
      </motion.div>
    </Link>
  )
}

export default function CleanerDashboardPage() {
  const { t, i18n } = useTranslation()
  const today = getTodayDateString()
  const { data, isLoading } = useCleaningTasks({
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
    <div className="min-h-screen bg-gray-50">
      {/* Mobile header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-3 safe-area-top">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center">
            <Home className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">{t('cleaner.todaysTasks')}</h1>
            <p className="text-xs text-gray-500">
              {new Date().toLocaleDateString(i18n.language, { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div className="px-4 py-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
            <p className="text-lg font-bold text-gray-900">{tasks.length}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase">{t('cleaner.total')}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
            <p className="text-lg font-bold text-amber-600">{grouped.active.length}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase">{t('cleaner.active')}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
            <p className="text-lg font-bold text-green-600">{grouped.completed.length}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase">{t('cleaner.done')}</p>
          </div>
        </div>
      </div>

      {/* Task list */}
      <div className="px-4 pb-24">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <CheckCircle2 className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-sm font-semibold text-gray-500">{t('cleaner.noTasksForToday')}</p>
            <p className="text-xs text-gray-400 mt-1">{t('cleaner.enjoyYourDayOff')}</p>
          </div>
        ) : (
          <>
            {/* Active tasks */}
            {grouped.active.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">
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
                <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">
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
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 safe-area-bottom">
        <div className="flex items-center justify-around py-2">
          <Link
            to="/cleaner"
            className="flex flex-col items-center gap-1 px-4 py-2 min-w-[48px] min-h-[48px] justify-center"
          >
            <Home className="w-5 h-5 text-gray-900" />
            <span className="text-[10px] font-bold text-gray-900">{t('cleaner.tasks')}</span>
          </Link>
          <Link
            to="/cleaning"
            className="flex flex-col items-center gap-1 px-4 py-2 min-w-[48px] min-h-[48px] justify-center"
          >
            <SprayCan className="w-5 h-5 text-gray-400" />
            <span className="text-[10px] font-bold text-gray-400">{t('cleaner.all')}</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
