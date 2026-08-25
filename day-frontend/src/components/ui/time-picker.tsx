import { useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

interface TimePickerProps {
  id?: string
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

// Convert an HH:mm string into minutes-since-midnight for nearest-option matching.
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

// Accepts "9", "930", "9:3", "09.30" and returns a canonical "HH:MM", or null
// when the typed text cannot be a valid time yet.
function parseTypedTime(input: string): string | null {
  const digits = input.replace(/\D/g, '')
  if (digits.length < 3) {
    const hours = Number(digits)
    if (digits.length === 0 || !Number.isFinite(hours) || hours > 23) return null
    return `${String(hours).padStart(2, '0')}:00`
  }
  if (digits.length > 4) return null
  const hours = Number(digits.slice(0, digits.length - 2))
  const minutes = Number(digits.slice(-2))
  if (hours > 23 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

// The option to scroll to on open: the exact value, or the nearest slot to it.
function nearestOption(value?: string): string {
  if (!value) return TIME_OPTIONS[0]
  if (TIME_OPTIONS.includes(value)) return value
  const target = toMinutes(value)
  return TIME_OPTIONS.reduce((best, option) =>
    Math.abs(toMinutes(option) - target) < Math.abs(toMinutes(best) - target)
      ? option
      : best,
  )
}

export default function TimePicker({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: TimePickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const activeRef = useRef<HTMLButtonElement>(null)
  const resolvedPlaceholder = placeholder ?? t('common.selectTime')
  const displayValue = value && value.length > 0 ? value : resolvedPlaceholder
  const activeTime = nearestOption(value)
  const typedTime = parseTypedTime(query)
  const queryDigits = query.replace(/\D/g, '')
  const options = queryDigits
    ? TIME_OPTIONS.filter((time) => time.replace(':', '').startsWith(queryDigits))
    : TIME_OPTIONS

  function commit(time: string) {
    onChange(time)
    setQuery('')
    setOpen(false)
  }

  // On open, bring the selected (or nearest) time into view instead of 00:00.
  useEffect(() => {
    if (!open) return
    activeRef.current?.scrollIntoView({ block: 'center' })
  }, [open])

  function handleOpenChange(next: boolean) {
    // Clear the filter here rather than in an effect so closing does not queue
    // an extra render pass.
    if (!next) setQuery('')
    setOpen(next)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          id={id}
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
        {/* Typing beats scrolling 96 options: the field filters the list and
            Enter commits any valid HH:MM, including off-interval times. */}
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            const next = typedTime ?? options[0]
            if (next) commit(next)
          }}
          placeholder={t('common.timeInputHint')}
          aria-label={t('common.time')}
          className="mb-1 h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-black/10"
        />
        <div className="max-h-56 overflow-y-auto space-y-1 p-1">
          {options.length === 0 && (
            <p className="px-2.5 py-3 text-sm text-gray-400">{t('common.noResults')}</p>
          )}
          {options.map((time) => {
            const isSelected = time === value
            return (
              <button
                key={time}
                ref={time === activeTime ? activeRef : undefined}
                type="button"
                onClick={() => commit(time)}
                className={cn(
                  'flex min-h-[44px] w-full items-center rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors',
                  isSelected
                    ? 'bg-black text-white'
                    : 'text-gray-700 hover:bg-gray-100',
                )}
              >
                <span>{time}</span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
