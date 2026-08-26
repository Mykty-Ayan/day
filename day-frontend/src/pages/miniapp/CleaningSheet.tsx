/**
 * Booking a cleaner into the gap between a check-out and the next arrival.
 *
 * The window is short and the operator is usually walking, so the date defaults
 * to the day of the departure and the cleaner is one tap from the list.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SprayCan } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { assignCleaner, createCleaningTask } from '../../api/cleaning'
import { listCleaners } from '../../api/team'
import type { Booking } from '../../types/booking'
import { resultFeedback, tapFeedback } from '../../lib/telegram'
import { formatDay } from './format'
import { ActionButton, Field, Sheet } from './miniapp-ui'

export default function CleaningSheet({
  booking,
  onClose,
}: {
  booking: Booking | null
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [cleanerId, setCleanerId] = useState<string | null>(null)
  const [time, setTime] = useState('12:00')
  const [error, setError] = useState('')

  const cleaners = useQuery({
    queryKey: ['miniapp', 'cleaners'],
    queryFn: listCleaners,
    enabled: Boolean(booking),
  })

  const schedule = useMutation({
    mutationFn: async () => {
      const task = await createCleaningTask({
        property_id: booking!.property_id,
        booking_id: booking!.id,
        type: 'post_checkout',
        scheduled_date: booking!.check_out.slice(0, 10),
        scheduled_time: time,
      })
      // Assignment is a separate call, so an unassigned task still exists if no
      // cleaner was picked — better than losing the whole thing.
      if (cleanerId) await assignCleaner(task.id, cleanerId)
      return task
    },
    onSuccess: () => {
      resultFeedback('success')
      queryClient.invalidateQueries({ queryKey: ['miniapp'] })
      onClose()
    },
    onError: (mutationError) => {
      resultFeedback('error')
      const detail = (mutationError as { response?: { data?: { detail?: string } } }).response?.data
        ?.detail
      setError(detail || t('miniapp.cleaning.failed'))
    },
  })

  if (!booking) return null

  return (
    <Sheet open title={t('miniapp.cleaning.title')} onClose={onClose}>
      <div className="tg-surface rounded-xl px-3 py-3">
        <p className="text-sm font-semibold">{booking.property_name}</p>
        <p className="tg-hint text-xs">
          {t('miniapp.cleaning.after', { date: formatDay(booking.check_out, i18n.language) })}
        </p>
      </div>

      <Field label={t('miniapp.cleaning.time')} value={time} onChange={setTime} type="time" />

      <div>
        <span className="tg-hint mb-1 block text-xs font-bold uppercase tracking-wide">
          {t('miniapp.cleaning.cleaner')}
        </span>
        {cleaners.isLoading && <p className="tg-hint text-sm">{t('miniapp.loading')}</p>}
        {cleaners.data && cleaners.data.length === 0 && (
          <p className="tg-hint text-sm">{t('miniapp.cleaning.noCleaners')}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {(cleaners.data ?? []).map((cleaner) => {
            const active = cleanerId === cleaner.id
            return (
              <button
                key={cleaner.id}
                type="button"
                onClick={() => {
                  tapFeedback()
                  setCleanerId(active ? null : cleaner.id)
                }}
                className={`min-h-[40px] rounded-lg px-3 text-xs font-bold ${
                  active ? 'tg-active' : 'tg-surface tg-hint'
                }`}
              >
                {cleaner.full_name || cleaner.email}
              </button>
            )
          })}
        </div>
      </div>

      {error && <p className="text-sm font-semibold">{error}</p>}

      <ActionButton tone="primary" disabled={schedule.isPending} onClick={() => schedule.mutate()}>
        <SprayCan className="h-4 w-4" />
        {schedule.isPending ? t('miniapp.book.saving') : t('miniapp.cleaning.schedule')}
      </ActionButton>
    </Sheet>
  )
}
