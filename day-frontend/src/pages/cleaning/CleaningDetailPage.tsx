import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Camera, CheckCircle2, ClipboardList, Info } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'

import CleaningStatusBadge from '../../components/cleaning/CleaningStatusBadge'
import CleaningTypeBadge from '../../components/cleaning/CleaningTypeBadge'
import Button from '../../components/ui/Button'
import { showToast } from '../../components/ui/Toast'
import { useChangeCleaningTaskStatus, useCleaningTask } from '../../hooks/useCleaning'
import type { CleaningStatus, CleaningTaskDetail } from '../../types/cleaning'
import { CLEANING_VALID_TRANSITIONS } from '../../types/cleaning'

type Tab = 'Overview' | 'Report'

const TABS: Tab[] = ['Overview', 'Report']

export default function CleaningDetailPage() {
  const { taskId } = useParams({ strict: false }) as { taskId: string }
  const { data, isLoading } = useCleaningTask(taskId)
  const [activeTab, setActiveTab] = useState<Tab>('Overview')

  if (isLoading) {
    return (
      <div className="p-6 text-center text-gray-400">Loading task...</div>
    )
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-gray-400">Task not found</div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-6 max-w-4xl mx-auto"
    >
      <Link
        to="/cleaning"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Cleaning Tasks
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {data.task.property_name || 'Cleaning Task'}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {data.task.property_internal_name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CleaningTypeBadge type={data.task.type} />
          <CleaningStatusBadge status={data.task.status} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'Overview' && <OverviewTab data={data} />}
          {activeTab === 'Report' && <ReportTab data={data} />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}

function OverviewTab({ data }: { data: CleaningTaskDetail }) {
  const { task } = data
  const statusMutation = useChangeCleaningTaskStatus(task.id)

  const nextStatuses = CLEANING_VALID_TRANSITIONS[task.status]

  function handleStatusChange(status: CleaningStatus) {
    statusMutation.mutate(status, {
      onSuccess: () => showToast('success', `Status changed to ${status}`),
      onError: (err: Error) =>
        showToast('error', err.message || 'Failed to change status'),
    })
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Info className="w-5 h-5 text-gray-400" />
          Task Details
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-400">Type</span>
            <p className="font-medium mt-1">{task.type}</p>
          </div>
          <div>
            <span className="text-gray-400">Status</span>
            <p className="mt-1">
              <CleaningStatusBadge status={task.status} />
            </p>
          </div>
          <div>
            <span className="text-gray-400">Scheduled Date</span>
            <p className="font-medium mt-1">{task.scheduled_date || '—'}</p>
          </div>
          <div>
            <span className="text-gray-400">Scheduled Time</span>
            <p className="font-medium mt-1">{task.scheduled_time || '—'}</p>
          </div>
          <div>
            <span className="text-gray-400">Cleaner ID</span>
            <p className="font-medium mt-1">{task.cleaner_id || 'Unassigned'}</p>
          </div>
          <div>
            <span className="text-gray-400">Booking ID</span>
            <p className="font-medium mt-1">{task.booking_id || '—'}</p>
          </div>
          {task.started_at && (
            <div>
              <span className="text-gray-400">Started</span>
              <p className="font-medium mt-1">
                {new Date(task.started_at).toLocaleString()}
              </p>
            </div>
          )}
          {task.completed_at && (
            <div>
              <span className="text-gray-400">Completed</span>
              <p className="font-medium mt-1">
                {new Date(task.completed_at).toLocaleString()}
              </p>
            </div>
          )}
          {task.verified_at && (
            <div>
              <span className="text-gray-400">Verified</span>
              <p className="font-medium mt-1">
                {new Date(task.verified_at).toLocaleString()}
              </p>
            </div>
          )}
        </div>
        {task.notes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <span className="text-gray-400 text-sm">Notes</span>
            <p className="text-sm mt-1">{task.notes}</p>
          </div>
        )}
      </div>

      {nextStatuses.length > 0 && (
        <div className="flex gap-2">
          {nextStatuses.map((status) => (
            <Button
              key={status}
              disabled={statusMutation.isPending}
              onClick={() => handleStatusChange(status)}
            >
              Transition to {status}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

function ReportTab({ data }: { data: CleaningTaskDetail }) {
  const { report } = data

  if (!report) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center text-gray-400">
        No report submitted yet
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-gray-400" />
          Report
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <div>
            <span className="text-gray-400">Status</span>
            <p className="font-medium mt-1 capitalize">
              {report.report.status}
            </p>
          </div>
          <div>
            <span className="text-gray-400">Submitted</span>
            <p className="font-medium mt-1">
              {report.report.submitted_at
                ? new Date(report.report.submitted_at).toLocaleString()
                : '—'}
            </p>
          </div>
        </div>
        {report.report.notes && (
          <div className="pt-4 border-t border-gray-100">
            <span className="text-gray-400 text-sm">Notes</span>
            <p className="text-sm mt-1">{report.report.notes}</p>
          </div>
        )}
      </div>

      {report.photos.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Camera className="w-5 h-5 text-gray-400" />
            Photos ({report.photos.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {report.photos.map((photo) => (
              <div
                key={photo.id}
                className="rounded-lg border border-gray-200 overflow-hidden"
              >
                <div className="bg-gray-100 h-32 flex items-center justify-center text-gray-400 text-xs">
                  {photo.url}
                </div>
                <div className="p-2 text-xs">
                  <span className="text-gray-400 capitalize">
                    {photo.room_type}
                  </span>
                  {photo.metadata_verified && (
                    <span className="ml-2 text-green-600">Verified</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.checklist.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-gray-400" />
            Checklist ({report.checklist.length})
          </h3>
          <div className="space-y-2">
            {report.checklist.map((item) => (
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
                <span className="text-sm">{item.checklist_item_id}</span>
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
