/**
 * "My cleanings": what a cleaner sees in the Mini App instead of bookings and
 * money. Only their own tasks (the server narrows the list), what is still to
 * do and what they finished today, by day; one step at a time — start, then done.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Play, SprayCan } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { changeCleaningTaskStatus, listCleaningTasks } from '../../api/cleaning'
import { confirmAction, resultFeedback } from '../../lib/telegram'
import { companyFromToken } from '../../lib/token'
import type { CleaningStatus, CleaningTask, CleaningType } from '../../types/cleaning'
import { myCleaningDays, nextCleaningStep } from './cleaner'
import { errorText } from './errors'
import { addDays, formatDay, toISODate } from './format'
import { ActionButton, Section } from './miniapp-ui'

// What was left over the last days still shows; a week ahead is enough to plan.
const BACK_DAYS = 3
const AHEAD_DAYS = 7

const TYPE_LABEL: Record<CleaningType, string> = {
  post_checkout: 'cleaning.types.postCheckout',
  mid_stay: 'cleaning.types.midStay',
  on_demand: 'cleaning.types.onDemand',
}

const STATUS_LABEL: Record<CleaningStatus, string> = {
  pending: 'cleaning.status.pending',
  assigned: 'cleaning.status.assigned',
  in_progress: 'cleaning.status.inProgress',
  done: 'cleaning.status.done',
  verified: 'cleaning.status.verified',
}

const unitName = (task: CleaningTask) => task.property_internal_name || task.property_name || '—'

export default function CleanerScreen() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [now] = useState(() => new Date())
  const today = toISODate(now)
  // Per company: a chat relinked to another one must not see this one's list.
  const [company] = useState(() => companyFromToken(localStorage.getItem('access_token')))
  const listKey = ['miniapp', 'my-cleaning', company]

  const tasks = useQuery({
    queryKey: listKey,
    queryFn: () =>
      listCleaningTasks({
        date_from: toISODate(addDays(now, -BACK_DAYS)),
        date_to: toISODate(addDays(now, AHEAD_DAYS)),
        per_page: 100,
      }),
  })

  const step = useMutation({
    mutationFn: ({ task, to }: { task: CleaningTask; to: CleaningStatus }) => changeCleaningTaskStatus(task.id, to),
    onSuccess: () => {
      resultFeedback('success')
      setError('')
    },
    onError: (stepError) => {
      resultFeedback('error')
      setError(errorText(stepError, t('miniapp.loadFailed'), t))
    },
    // Read again either way: a step whose answer was lost may have been taken.
    onSettled: () => queryClient.invalidateQueries({ queryKey: listKey }),
  })

  async function advance(task: CleaningTask) {
    const to = nextCleaningStep(task.status)
    if (!to) return
    if (to === 'done' && !(await confirmAction(t('miniapp.cleaner.doneAsk', { unit: unitName(task) })))) return
    step.mutate({ task, to })
  }

  // No step on a list that is being read again: it may already be out of date.
  const busy = step.isPending || tasks.isFetching
  const tomorrow = toISODate(addDays(now, 1))
  const dayTitle = (date: string | null) =>
    date === null
      ? t('miniapp.cleaner.noDate')
      : date === today
        ? t('miniapp.cleaner.today')
        : date === tomorrow
          ? t('miniapp.cleaner.tomorrow')
          : formatDay(`${date}T12:00:00`, lang)
  const days = myCleaningDays(tasks.data?.items ?? [], today)

  return (
    <div className="tg-root min-h-screen pb-6">
      <main className="space-y-4 p-3">
        <h1 className="flex items-center gap-2 px-1 text-lg font-bold">
          <SprayCan className="h-5 w-5" />
          {t('miniapp.cleaner.title')}
        </h1>

        {error && (
          <p role="alert" className="text-sm font-semibold">
            {error}
          </p>
        )}
        {tasks.isLoading && <p className="tg-hint text-sm">{t('miniapp.loading')}</p>}
        {tasks.isError && <p className="text-sm">{errorText(tasks.error, t('miniapp.loadFailed'), t)}</p>}
        {tasks.data && days.length === 0 && <p className="tg-hint text-sm">{t('miniapp.cleaner.none')}</p>}

        {days.map((day) => (
          <Section key={day.date ?? 'undated'} title={dayTitle(day.date)} count={day.tasks.length}>
            {day.tasks.map((task) => {
              const to = nextCleaningStep(task.status)
              return (
                <div key={task.id} className="space-y-2 px-3 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-bold">{unitName(task)}</span>
                    <span className="tg-hint shrink-0 text-xs">{task.scheduled_time?.slice(0, 5) ?? ''}</span>
                  </div>
                  <p className="tg-hint text-xs">
                    {t(TYPE_LABEL[task.type])} · {t(STATUS_LABEL[task.status])}
                  </p>
                  {task.notes && <p className="text-sm">{task.notes}</p>}
                  {to && (
                    <ActionButton tone="primary" disabled={busy} onClick={() => advance(task)}>
                      {to === 'done' ? <CheckCircle2 className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      {t(to === 'done' ? 'miniapp.cleaner.done' : 'miniapp.cleaner.start')}
                    </ActionButton>
                  )}
                </div>
              )
            })}
          </Section>
        ))}
      </main>
    </div>
  )
}
