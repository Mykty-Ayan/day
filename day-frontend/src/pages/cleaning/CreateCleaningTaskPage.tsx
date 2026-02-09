import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'

import Button from '../../components/ui/Button'
import { showToast } from '../../components/ui/Toast'
import { useCreateCleaningTask } from '../../hooks/useCleaning'
import { useProperties } from '../../hooks/useProperties'
import type { CleaningType } from '../../types/cleaning'

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
  const navigate = useNavigate()
  const [form, setForm] = useState<FormData>(initialForm)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const { data: propertiesData } = useProperties()
  const createMutation = useCreateCleaningTask()

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.property_id) errs.property_id = 'Property is required'
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
          showToast('success', 'Cleaning task created')
          navigate({
            to: '/cleaning/$taskId',
            params: { taskId: task.id },
          })
        },
        onError: (err: Error) =>
          showToast('error', err.message || 'Failed to create task'),
      },
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-6 max-w-2xl mx-auto"
    >
      <Link
        to="/cleaning"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Create Cleaning Task
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          {/* Property */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Property *
            </label>
            <select
              value={form.property_id}
              onChange={(e) => {
                setForm({ ...form, property_id: e.target.value })
                setErrors({ ...errors, property_id: '' })
              }}
              className={`w-full bg-gray-50 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm ${
                errors.property_id ? 'border-red-300' : 'border-gray-200'
              }`}
            >
              <option value="">Select property...</option>
              {propertiesData?.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.internal_name})
                </option>
              ))}
            </select>
            {errors.property_id && (
              <p className="text-red-500 text-xs mt-1">{errors.property_id}</p>
            )}
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <select
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: e.target.value as CleaningType })
              }
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm"
            >
              <option value="post_checkout">Post Checkout</option>
              <option value="mid_stay">Mid Stay</option>
              <option value="on_demand">On Demand</option>
            </select>
          </div>

          {/* Scheduled Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Scheduled Date
              </label>
              <input
                type="date"
                value={form.scheduled_date}
                onChange={(e) =>
                  setForm({ ...form, scheduled_date: e.target.value })
                }
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Scheduled Time
              </label>
              <input
                type="time"
                value={form.scheduled_time}
                onChange={(e) =>
                  setForm({ ...form, scheduled_time: e.target.value })
                }
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm resize-none"
              placeholder="Add notes for the cleaner..."
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link to="/cleaning">
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Task'}
          </Button>
        </div>
      </form>
    </motion.div>
  )
}
