import { useState } from 'react'
import { Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

interface TimePickerProps {
  value?: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

const TIME_INTERVAL_MINUTES = 15
const TIME_OPTIONS = Array.from(
  { length: (24 * 60) / TIME_INTERVAL_MINUTES },
  (_, index) => {
    const totalMinutes = index * TIME_INTERVAL_MINUTES
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  },
)

export default function TimePicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: TimePickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const resolvedPlaceholder = placeholder ?? t('common.selectTime')
  const displayValue = value && value.length > 0 ? value : resolvedPlaceholder

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-11 w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 shadow-sm',
            'focus:outline-none focus:ring-2 focus:ring-black/10 disabled:cursor-not-allowed disabled:opacity-50',
            !value && 'text-gray-400',
            className,
          )}
        >
          <span>{displayValue}</span>
          <Clock className="h-4 w-4 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {t('common.time')}
        </div>
        <div className="max-h-56 overflow-y-auto space-y-1 p-1">
          {TIME_OPTIONS.map((time) => {
            const isSelected = time === value
            return (
              <button
                key={time}
                type="button"
                onClick={() => {
                  onChange(time)
                  setOpen(false)
                }}
                className={cn(
                  'flex min-h-[40px] w-full items-center justify-between rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors',
                  isSelected
                    ? 'bg-black text-white'
                    : 'text-gray-700 hover:bg-gray-100',
                )}
              >
                <span>{time}</span>
                {isSelected && <span className="text-[10px] uppercase">{t('common.selected')}</span>}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
