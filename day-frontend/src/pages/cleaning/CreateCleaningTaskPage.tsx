import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import Button from '../../components/ui/Button'
import { showToast } from '../../components/ui/Toast'
import { useCreateCleaningTask } from '../../hooks/useCleaning'
import { useProperties } from '../../hooks/useProperties'
import type { CleaningType } from '../../types/cleaning'
import DatePicker from '../../components/ui/date-picker'
import TimePicker from '../../components/ui/time-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'

interface FormData {
  property_id: string
  type: CleaningType
  scheduled_date: string
  scheduled_time: string
  notes: string
  cleaner_id: string
}

const initialForm: FormData = {
  property_id: '',
  type: 'post_checkout',
  scheduled_date: '',
  scheduled_time: '',
  notes: '',
  cleaner_id: '',
}

export default function CreateCleaningTaskPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form, setForm] = useState<FormData>(initialForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { data: propertiesData } = useProperties()
  const createMutation = useCreateCleaningTask()

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.property_id) errs.property_id = t('cleaning.propertyRequired')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    createMutation.mutate(
      {
        property_id: form.property_id,
        type: form.type,
        scheduled_date: form.scheduled_date || undefined,
        scheduled_time: form.scheduled_time || undefined,
        notes: form.notes || undefined,
        cleaner_id: form.cleaner_id || undefined,
      },
      {
        onSuccess: (task) => {
          showToast('success', t('cleaning.cleaningTaskCreated'))
          navigate({
            to: '/cleaning/$taskId',
            params: { taskId: task.id },
          })
        },
        onError: (err: Error) =>
          showToast('error', err.message || t('cleaning.failedCreateTask')),
      },
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-4xl mx-auto px-4 py-4 sm:px-6 sm:py-6"
    >
      <Link
        to="/cleaning"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('common.back')}
      </Link>

      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
        {t('cleaning.createCleaningTask')}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-5">
          {/* Property */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('cleaning.property') + ' *'}
            </label>
            <Select
              value={form.property_id || undefined}
              onValueChange={(value) => {
                setForm({ ...form, property_id: value })
                setErrors({ ...errors, property_id: '' })
              }}
            >
              <SelectTrigger className={errors.property_id ? 'border-red-300' : ''}>
                <SelectValue placeholder={t('bookings.selectProperty')} />
              </SelectTrigger>
              <SelectContent>
                {propertiesData?.items.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.internal_name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.property_id && (
              <p className="text-red-500 text-xs mt-1">{errors.property_id}</p>
            )}
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('cleaning.type')}
            </label>
            <Select
              value={form.type}
              onValueChange={(value) =>
                setForm({ ...form, type: value as CleaningType })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="post_checkout">{t('cleaning.types.postCheckout')}</SelectItem>
                <SelectItem value="mid_stay">{t('cleaning.types.midStay')}</SelectItem>
                <SelectItem value="on_demand">{t('cleaning.types.onDemand')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Scheduled Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('cleaning.scheduledDate')}
              </label>
              <DatePicker
                value={form.scheduled_date}
                onChange={(value) =>
                  setForm({ ...form, scheduled_date: value })
                }
                placeholder={t('common.selectDate')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('cleaning.scheduledTime')}
              </label>
              <TimePicker
                value={form.scheduled_time}
                onChange={(value) =>
                  setForm({ ...form, scheduled_time: value })
                }
                placeholder={t('common.selectTime')}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('common.notes')}
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm resize-none"
              placeholder={t('cleaning.addNotesForCleaner')}
            />
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <Link to="/cleaning" className="w-full sm:w-auto">
            <Button variant="secondary" className="w-full sm:w-auto">
              {t('common.cancel')}
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={createMutation.isPending}
            className="w-full sm:w-auto sm:min-w-[170px]"
          >
            {createMutation.isPending ? t('cleaning.creating') : t('cleaning.createTask')}
          </Button>
        </div>
      </form>
    </motion.div>
  )
}
