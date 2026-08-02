import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Camera, CheckCircle2, ClipboardList, Info } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import CleaningStatusBadge from '../../components/cleaning/CleaningStatusBadge'
import CleaningTypeBadge from '../../components/cleaning/CleaningTypeBadge'
import Button from '../../components/ui/Button'
import { showToast } from '../../components/ui/Toast'
import Spinner from '../../components/ui/Spinner'
import { useChangeCleaningTaskStatus, useCleaningTask } from '../../hooks/useCleaning'
import type { CleaningStatus, CleaningTaskDetail, CleaningType } from '../../types/cleaning'
import { CLEANING_VALID_TRANSITIONS } from '../../types/cleaning'

type Tab = 'overview' | 'report'

const TABS: Tab[] = ['overview', 'report']

export default function CleaningDetailPage() {
  const { t } = useTranslation()
  const { taskId } = useParams({ strict: false }) as { taskId: string }
  const { data, isLoading } = useCleaningTask(taskId)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  if (isLoading) {
    return <Spinner />
  }

  if (!data) {
    return (
      <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-4xl mx-auto">
        <Link
          to="/cleaning"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('cleaning.backToCleaningTasks')}
        </Link>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-sm text-gray-500">{t('cleaning.taskNotFound')}</p>
        </div>
      </div>
    )
  }

  const tabLabels: Record<Tab, string> = {
    overview: t('bookings.tabs.overview'),
    report: t('cleaning.report'),
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="px-4 py-4 sm:px-6 sm:py-6 max-w-4xl mx-auto"
    >
      <Link
        to="/cleaning"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('cleaning.backToCleaningTasks')}
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">
            {data.task.property_name || t('cleaner.cleaningTask')}
          </h1>
          <p className="mt-1 truncate text-sm text-gray-400">
            {data.task.property_internal_name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CleaningTypeBadge type={data.task.type} />
          <CleaningStatusBadge status={data.task.status} />
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 overflow-x-auto">
        <div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`cleaning-tab-${tab}`}
              aria-selected={activeTab === tab}
              aria-controls={`cleaning-panel-${tab}`}
              onClick={() => setActiveTab(tab)}
              className={`min-h-[44px] whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                activeTab === tab
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          role="tabpanel"
          id={`cleaning-panel-${activeTab}`}
          aria-labelledby={`cleaning-tab-${activeTab}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'overview' && <OverviewTab data={data} />}
          {activeTab === 'report' && <ReportTab data={data} />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}

function OverviewTab({ data }: { data: CleaningTaskDetail }) {
  const { t } = useTranslation()
  const { task } = data
  const statusMutation = useChangeCleaningTaskStatus(task.id)

  const typeLabels: Record<CleaningType, string> = {
    post_checkout: t('cleaning.types.postCheckout'),
    mid_stay: t('cleaning.types.midStay'),
    on_demand: t('cleaning.types.onDemand'),
  }

  const nextStatuses = CLEANING_VALID_TRANSITIONS[task.status]

  function handleStatusChange(status: CleaningStatus) {
    statusMutation.mutate(status, {
      onSuccess: () => showToast('success', t('cleaning.statusChangedTo', { status })),
      onError: (err: Error) =>
        showToast('error', err.message || t('cleaning.failedChangeStatus')),
    })
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Info className="w-5 h-5 text-gray-400" />
          {t('cleaning.taskDetails')}
        </h2>
        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <span className="text-gray-400">{t('cleaning.type')}</span>
            <p className="font-medium mt-1">{typeLabels[task.type]}</p>
          </div>
          <div>
            <span className="text-gray-400">{t('common.status')}</span>
            <p className="mt-1">
              <CleaningStatusBadge status={task.status} />
            </p>
          </div>
          <div>
            <span className="text-gray-400">{t('cleaning.scheduledDate')}</span>
            <p className="font-medium mt-1">{task.scheduled_date || '—'}</p>
          </div>
          <div>
            <span className="text-gray-400">{t('cleaning.scheduledTime')}</span>
            <p className="font-medium mt-1">{task.scheduled_time || '—'}</p>
          </div>
          <div>
            <span className="text-gray-400">{t('cleaning.cleaner')}</span>
            <p className="font-medium mt-1">
              {task.cleaner_name || (task.cleaner_id ? t('cleaning.assignedCleaner') : t('cleaning.unassigned'))}
            </p>
          </div>
          <div>
            <span className="text-gray-400">{t('cleaning.bookingId')}</span>
            <p className="font-medium mt-1">{task.booking_id || '—'}</p>
          </div>
          {task.started_at && (
            <div>
              <span className="text-gray-400">{t('cleaning.started')}</span>
              <p className="font-medium mt-1">
                {new Date(task.started_at).toLocaleString()}
              </p>
            </div>
          )}
          {task.completed_at && (
            <div>
              <span className="text-gray-400">{t('cleaning.completed')}</span>
              <p className="font-medium mt-1">
                {new Date(task.completed_at).toLocaleString()}
              </p>
            </div>
          )}
          {task.verified_at && (
            <div>
              <span className="text-gray-400">{t('cleaning.verified')}</span>
              <p className="font-medium mt-1">
                {new Date(task.verified_at).toLocaleString()}
              </p>
            </div>
          )}
        </div>
        {task.notes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <span className="text-gray-400 text-sm">{t('common.notes')}</span>
            <p className="text-sm mt-1">{task.notes}</p>
          </div>
        )}
      </div>

      {nextStatuses.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {nextStatuses.map((status) => (
            <Button
              key={status}
              disabled={statusMutation.isPending}
              onClick={() => handleStatusChange(status)}
              className="w-full sm:w-auto"
              data-testid={`cleaning-transition-${status}`}
            >
              {t('cleaning.transitionTo', { status })}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

function ReportTab({ data }: { data: CleaningTaskDetail }) {
  const { t } = useTranslation()
  const { report } = data

  if (!report) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center text-gray-400">
        {t('cleaning.noReportYet')}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-gray-400" />
          {t('cleaning.report')}
        </h2>
        <div className="mb-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <span className="text-gray-400">{t('common.status')}</span>
            <p className="font-medium mt-1">
              {t('cleaning.reportStatus.' + report.report.status)}
            </p>
          </div>
          <div>
            <span className="text-gray-400">{t('cleaning.submitted')}</span>
            <p className="font-medium mt-1">
              {report.report.submitted_at
                ? new Date(report.report.submitted_at).toLocaleString()
                : '—'}
            </p>
          </div>
        </div>
        {report.report.notes && (
          <div className="pt-4 border-t border-gray-100">
            <span className="text-gray-400 text-sm">{t('common.notes')}</span>
            <p className="text-sm mt-1">{report.report.notes}</p>
          </div>
        )}
      </div>

      {report.photos.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
          <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Camera className="w-5 h-5 text-gray-400" />
            {t('cleaning.photos')} ({report.photos.length})
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {report.photos.map((photo) => (
              <div
                key={photo.id}
                className="rounded-lg border border-gray-200 overflow-hidden"
              >
                <div className="bg-gray-100 h-32 flex items-center justify-center text-gray-400 text-xs">
                  {photo.url}
                </div>
                <div className="p-2 text-xs">
                  <span className="text-gray-400">
                    {t('cleaning.roomTypes.' + photo.room_type)}
                  </span>
                  {photo.metadata_verified && (
                    <span className="ml-2 text-green-600">{t('cleaning.verified')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.checklist.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6">
          <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-gray-400" />
            {t('cleaning.checklist')} ({report.checklist.length})
          </h3>
          <div className="space-y-2">
            {report.checklist.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
              >
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    item.is_done
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-gray-300'
                  }`}
                >
                  {item.is_done && <CheckCircle2 className="w-3 h-3" />}
                </div>
                <span className="text-sm">{t('cleaning.checklistItem', { number: index + 1 })}</span>
                {item.note && (
                  <span className="text-xs text-gray-400 ml-auto">
                    {item.note}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
