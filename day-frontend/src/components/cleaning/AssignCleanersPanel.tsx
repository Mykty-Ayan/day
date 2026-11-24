import { useState } from 'react'
import { UserCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAssignCleaners } from '../../hooks/useCleaning'
import { useCleaners } from '../../hooks/useTeam'
import type { CleaningTask } from '../../types/cleaning'
import Button from '../ui/Button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Sheet } from '../ui/sheet'

export default function AssignCleanersPanel({
  tasks,
  open,
  onClose,
}: {
  tasks: CleaningTask[]
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()

  return (
    <Sheet open={open} onClose={onClose} title={t('today.assignCleaner')}>
      <AssignForm tasks={tasks} onDone={onClose} />
    </Sheet>
  )
}

function AssignForm({ tasks, onDone }: { tasks: CleaningTask[]; onDone: () => void }) {
  const { t } = useTranslation()
  const { data: cleaners = [], isLoading, isError } = useCleaners()
  const assign = useAssignCleaners()
  const [picked, setPicked] = useState<Record<string, string>>({})
  const assignments = tasks.flatMap((task) =>
    picked[task.id] ? [{ taskId: task.id, cleanerId: picked[task.id] }] : [],
  )

  if (isError) return <p role="alert" className="text-sm text-danger">{t('common.errorLoading')}</p>

  if (!isLoading && cleaners.length === 0) {
    return <p className="text-sm text-ink-muted">{t('cleaning.noCleaners')}</p>
  }

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-4">
        {tasks.map((task) => (
          <li key={task.id} className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-ink">{task.property_name || task.property_internal_name}</span>
            <Select
              value={picked[task.id] ?? ''}
              onValueChange={(cleanerId) => setPicked({ ...picked, [task.id]: cleanerId })}
            >
              <SelectTrigger aria-label={t('today.pickCleaner')}>
                <SelectValue placeholder={t('today.pickCleaner')} />
              </SelectTrigger>
              <SelectContent>
                {cleaners.map((cleaner) => (
                  <SelectItem key={cleaner.id} value={cleaner.id}>
                    {cleaner.full_name || cleaner.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </li>
        ))}
      </ul>

      {assign.isError && <p role="alert" className="text-sm text-danger">{t('today.assignFailed')}</p>}

      <Button
        disabled={assign.isPending || assignments.length === 0}
        onClick={() => assign.mutate(assignments, { onSuccess: onDone })}
      >
        <UserCheck className="h-4 w-4" aria-hidden="true" />
        {assign.isPending ? '…' : t('today.assign')}
      </Button>
    </div>
  )
}
