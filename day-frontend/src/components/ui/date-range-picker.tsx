import { useState } from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { cn } from '../../lib/utils'
import { Calendar } from './calendar'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

type DateLike = string | Date | undefined

interface DateRangePickerProps {
  startDate?: string
  endDate?: string
  onRangeChange: (start: string, end: string) => void
  minDate?: DateLike
  placeholder?: string
  disabled?: boolean
  className?: string
  error?: boolean
}

function normalizeDate(value?: DateLike): Date | undefined {
  if (!value) return undefined
  const parsed =
    typeof value === 'string'
      ? parseISO(value)
      : new Date(value.getFullYear(), value.getMonth(), value.getDate())
  if (!isValid(parsed)) return undefined
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
}

export default function DateRangePicker({
  startDate,
  endDate,
  onRangeChange,
  minDate,
  placeholder = 'Select dates',
  disabled,
  className,
  error,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const start = normalizeDate(startDate)
  const end = normalizeDate(endDate)
  const min = normalizeDate(minDate)

  const selected: DateRange | undefined =
    start ? { from: start, to: end } : undefined

  function handleSelect(range: DateRange | undefined) {
    if (!range) {
      onRangeChange('', '')
      return
    }
    const from = range.from ? format(range.from, 'yyyy-MM-dd') : ''
    const to = range.to ? format(range.to, 'yyyy-MM-dd') : ''
    onRangeChange(from, to)
    if (range.from && range.to) {
      setOpen(false)
    }
  }

  let label = placeholder
  if (start && end) {
    label = `${format(start, 'dd.MM')} → ${format(end, 'dd.MM')}`
  } else if (start) {
    label = `${format(start, 'dd.MM')} → ...`
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-11 w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 shadow-sm',
            'focus:outline-none focus:ring-2 focus:ring-black/10 disabled:cursor-not-allowed disabled:opacity-50',
            !startDate && !endDate && 'text-gray-400',
            error && 'border-red-300',
            className,
          )}
        >
          <span className="truncate">{label}</span>
          <CalendarIcon className="h-4 w-4 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[120] w-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl"
        align="start"
        sideOffset={8}
      >
        <Calendar
          mode="range"
          selected={selected}
          defaultMonth={start ?? min ?? new Date()}
          showOutsideDays={false}
          pagedNavigation
          min={1}
          onSelect={handleSelect}
          disabled={min ? { before: min } : undefined}
          numberOfMonths={2}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
