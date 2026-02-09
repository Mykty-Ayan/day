import { format, parseISO } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Calendar } from './calendar'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

type DateLike = string | Date | undefined

interface DatePickerProps {
  value?: string
  onChange: (value: string) => void
  minDate?: DateLike
  placeholder?: string
  disabled?: boolean
  className?: string
}

function normalizeDate(value?: DateLike): Date | undefined {
  if (!value) return undefined
  if (typeof value === 'string') {
    return parseISO(value)
  }
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

export default function DatePicker({
  value,
  onChange,
  minDate,
  placeholder = 'Pick a date',
  disabled,
  className,
}: DatePickerProps) {
  const selected = value ? parseISO(value) : undefined
  const min = normalizeDate(minDate)

  return (
    <Popover>
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
          <span>{selected ? format(selected, 'dd.MM.yyyy') : placeholder}</span>
          <CalendarIcon className="h-4 w-4 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => onChange(date ? format(date, 'yyyy-MM-dd') : '')}
          disabled={min ? { before: min } : undefined}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
