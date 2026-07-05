import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Camera,
  Send,
  Loader2,
  MapPin,
  Clock,
  AlertCircle,
  X,
} from 'lucide-react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import Spinner from '../../components/ui/Spinner'
import {
  useCleaningTask,
  useChangeCleaningTaskStatus,
  useSubmitReport,
  useChecklistTemplates,
  useChecklistTemplate as useChecklistTemplateHook,
} from '../../hooks/useCleaning'
import type { CleaningStatus, CleaningType, RoomType } from '../../types/cleaning'
import { getChecklistTemplate as fetchChecklistTemplate } from '../../api/cleaning'
import { showToast } from '../../components/ui/Toast'

const CLEANING_VALID_TRANSITIONS: Record<CleaningStatus, CleaningStatus[]> = {
  pending: ['assigned'],
  assigned: ['in_progress'],
  in_progress: ['done'],
  done: ['verified'],
  verified: [],
}

const statusColors: Record<CleaningStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  assigned: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  done: 'bg-green-100 text-green-700',
  verified: 'bg-emerald-100 text-emerald-700',
}

interface ChecklistState {
  [itemId: string]: boolean
}

interface PhotoEntry {
  file: File
  preview: string
  room_type: RoomType
}

export default function CleanerTaskDetailPage() {
  const { t } = useTranslation()
  const { taskId } = useParams({ strict: false }) as { taskId: string }
  const navigate = useNavigate()
  const { data: taskDetail, isLoading } = useCleaningTask(taskId)
  const changeStatus = useChangeCleaningTaskStatus(taskId)
  const submitReport = useSubmitReport(taskId)
  const { data: templates } = useChecklistTemplates()
  const firstTemplateId = templates?.[0]?.id ?? ''
  const { data: firstTemplateDetail } = useChecklistTemplateHook(firstTemplateId)
  const checklistItemTitleById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const it of firstTemplateDetail?.items ?? []) {
      map[it.id] = it.title
    }
    return map
  }, [firstTemplateDetail])

  const [checklist, setChecklist] = useState<ChecklistState>({})
  const [photos, setPhotos] = useState<PhotoEntry[]>([])
  const [notes, setNotes] = useState('')
  const [showReportForm, setShowReportForm] = useState(false)

  const task = taskDetail?.task
  const report = taskDetail?.report

  const statusLabels: Record<CleaningStatus, string> = {
    pending: t('cleaning.status.pending'),
    assigned: t('cleaning.status.assigned'),
    in_progress: t('cleaning.status.inProgress'),
    done: t('cleaning.status.done'),
    verified: t('cleaning.status.verified'),
  }

  const nextActionLabels: Record<CleaningStatus, string> = {
    pending: t('cleaning.actions.acceptTask'),
    assigned: t('cleaning.actions.startCleaning'),
    in_progress: t('cleaning.actions.markAsDone'),
    done: t('cleaning.actions.verify'),
    verified: '',
  }

  const typeLabels: Record<CleaningType, string> = {
    post_checkout: t('cleaning.types.postCheckout'),
    mid_stay: t('cleaning.types.midStay'),
    on_demand: t('cleaning.types.onDemand'),
  }

  const ROOM_TYPES: { value: RoomType; label: string }[] = [
    { value: 'bathroom', label: t('cleaning.roomTypes.bathroom') },
    { value: 'kitchen', label: t('cleaning.roomTypes.kitchen') },
    { value: 'bedroom', label: t('cleaning.roomTypes.bedroom') },
    { value: 'other', label: t('cleaning.roomTypes.other') },
  ]

  function toggleChecklistItem(itemId: string) {
    setChecklist((prev) => ({ ...prev, [itemId]: !prev[itemId] }))
  }

  function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    setPhotos((prev) => [...prev, { file, preview, room_type: 'other' }])
  }

  function updatePhotoRoomType(index: number, roomType: RoomType) {
    setPhotos((prev) => prev.map((p, i) => i === index ? { ...p, room_type: roomType } : p))
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      const removed = prev[index]
      if (removed) URL.revokeObjectURL(removed.preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  function handleStatusChange() {
    if (!task) return
    const nextStatuses = CLEANING_VALID_TRANSITIONS[task.status]
    if (nextStatuses.length === 0) return

    const nextStatus = nextStatuses[0]

    if (task.status === 'in_progress') {
      setShowReportForm(true)
      return
    }

    changeStatus.mutate(nextStatus, {
      onSuccess: () => {
        showToast('success', t('cleaner.statusChangedTo', { status: t('cleaning.status.' + nextStatus) }))
      },
      onError: () => {
        showToast('error', t('cleaner.failedChangeStatus'))
      },
    })
  }

  async function handleSubmitReport() {
    if (!task) return

    // In a real app, we'd upload photos to get URLs first
    // For now, we submit the report with checklist data and notes
    const firstTemplate = templates?.[0]
    const checklistItems = firstTemplate
      ? (await fetchChecklistTemplate(firstTemplate.id)).items
      : []

    submitReport.mutate(
      {
        cleaner_id: task.cleaner_id || '',
        notes: notes || undefined,
        checklist: checklistItems.map((item) => ({
          checklist_item_id: item.id,
          is_done: !!checklist[item.id],
        })),
      },
      {
        onSuccess: () => {
          showToast('success', t('cleaner.reportSubmitted'))
          setShowReportForm(false)
        },
        onError: () => {
          showToast('error', t('cleaner.failedSubmitReport'))
        },
      },
    )
  }

  if (isLoading) {
    return <Spinner />
  }

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-sm text-gray-500">{t('cleaner.taskNotFound')}</p>
        <button
          type="button"
          onClick={() => navigate({ to: '/cleaner' })}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-2.5 font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('cleaner.backToTasks')}
        </button>
      </div>
    )
  }

  const nextStatuses = CLEANING_VALID_TRANSITIONS[task.status]
  const hasNextAction = nextStatuses.length > 0
  const hasFixedActionBar = hasNextAction && !showReportForm

  // Get first template's items for checklist display
  const firstTemplate = templates?.[0]

  return (
    <div
      className={`min-h-screen bg-gray-50 ${
        hasFixedActionBar
          ? 'pb-[calc(7.5rem+env(safe-area-inset-bottom))]'
          : 'pb-6 safe-area-bottom'
      }`}
    >
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-4 pb-4 safe-area-top">
        <div className="flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate({ to: '/cleaner' })}
            className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center min-w-[48px] min-h-[48px]"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </motion.button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">
              {task.property_internal_name || task.property_name || t('cleaner.cleaningTask')}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${statusColors[task.status]}`}>
                {statusLabels[task.status]}
              </span>
              <span className="text-xs text-gray-400">{typeLabels[task.type]}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Task info */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-3">{t('cleaner.taskDetails')}</h2>
          <div className="space-y-2">
            {task.scheduled_date && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  {task.scheduled_date}
                  {task.scheduled_time && ` ${t('cleaning.atTime', { time: task.scheduled_time })}`}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-600">
                {task.property_internal_name || task.property_name || t('common.unknown')}
              </span>
            </div>
            {task.notes && (
              <div className="flex items-start gap-2 pt-1">
                <AlertCircle className="w-4 h-4 text-gray-400 mt-0.5" />
                <p className="text-sm text-gray-600">{task.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Existing report */}
        {report && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-3">{t('cleaner.report')}</h2>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
              report.report.status === 'approved' ? 'bg-green-100 text-green-700' :
              report.report.status === 'rejected' ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {t('cleaning.reportStatus.' + report.report.status)}
            </span>
            {report.report.notes && (
              <p className="text-sm text-gray-600 mt-2">{report.report.notes}</p>
            )}
            {report.checklist.length > 0 && (
              <div className="mt-3 space-y-1">
                {report.checklist.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-2">
                    {item.is_done ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <Circle className="w-4 h-4 text-gray-300" />
                    )}
                    <span className="text-xs text-gray-600">
                      {checklistItemTitleById[item.checklist_item_id] ?? t('cleaning.checklistItem', { number: idx + 1 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Report form */}
        {showReportForm && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-4"
          >
            <h2 className="text-sm font-bold text-gray-900">{t('cleaner.submitReport')}</h2>

            {/* Checklist */}
            {firstTemplate && (
              <div>
                <ChecklistSection
                  templateId={firstTemplate.id}
                  checklist={checklist}
                  onToggle={toggleChecklistItem}
                />
              </div>
            )}

            {/* Photo upload */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                {t('cleaner.photos')}
              </p>
              <div className="flex flex-wrap gap-3">
                {photos.map((photo, i) => (
                  <div key={i} className="flex w-24 flex-col gap-1">
                    <div className="relative h-24 w-24 overflow-hidden rounded-xl border border-gray-200">
                      <img src={photo.preview} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        aria-label={t('common.delete')}
                        className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <select
                      value={photo.room_type}
                      onChange={(e) => updatePhotoRoomType(i, e.target.value as RoomType)}
                      aria-label={t('cleaner.photos')}
                      className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:ring-2 focus:ring-black/10"
                    >
                      {ROOM_TYPES.map((rt) => (
                        <option key={rt.value} value={rt.value}>{rt.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
                <label className="h-24 w-24 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors min-w-[48px] min-h-[48px]">
                  <Camera className="w-5 h-5 text-gray-400" />
                  <span className="text-[10px] text-gray-400 mt-1">{t('common.add')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoCapture}
                  />
                </label>
              </div>
            </div>

            {/* Notes */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                {t('cleaner.notes')}
              </p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('cleaner.anyIssuesOrComments')}
                rows={3}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm resize-none"
              />
            </div>

            {/* Submit */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSubmitReport}
                disabled={submitReport.isPending}
                className="flex-1 flex items-center justify-center gap-2 bg-black text-white hover:bg-gray-800 rounded-xl px-4 py-3 text-sm font-bold transition-colors disabled:opacity-50 min-h-[48px]"
              >
                {submitReport.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {t('cleaner.submitReport')}
                  </>
                )}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowReportForm(false)}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50 min-h-[48px] sm:w-auto"
              >
                {t('common.cancel')}
              </motion.button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Bottom action button */}
      {hasNextAction && !showReportForm && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 safe-area-bottom">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleStatusChange}
            disabled={changeStatus.isPending}
            className="w-full flex items-center justify-center gap-2 bg-black text-white hover:bg-gray-800 rounded-2xl px-6 py-4 text-sm font-bold shadow-lg transition-colors disabled:opacity-50 min-h-[48px]"
          >
            {changeStatus.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                {nextActionLabels[task.status]}
              </>
            )}
          </motion.button>
        </div>
      )}
    </div>
  )
}

function ChecklistSection({
  templateId,
  checklist,
  onToggle,
}: {
  templateId: string
  checklist: ChecklistState
  onToggle: (itemId: string) => void
}) {
  const { t } = useTranslation()
  const { data: templateDetail } = useChecklistTemplate(templateId)
  const items = templateDetail?.items ?? []

  if (items.length === 0) return null

  return (
    <div>
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
        {t('cleaner.checklist')}
      </p>
      <div className="space-y-1">
        {items.map((item) => (
          <motion.button
            key={item.id}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={() => onToggle(item.id)}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left min-h-[48px]"
          >
            {checklist[item.id] ? (
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
            ) : (
              <Circle className="w-5 h-5 text-gray-300 shrink-0" />
            )}
            <span className={`text-sm ${checklist[item.id] ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
              {item.title}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}

function useChecklistTemplate(id: string) {
  return useChecklistTemplateHook(id)
}
