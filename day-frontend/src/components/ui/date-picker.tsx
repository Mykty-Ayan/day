import { useState } from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import type { Matcher } from 'react-day-picker'
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
  const parsed =
    typeof value === 'string'
      ? parseISO(value)
      : new Date(value.getFullYear(), value.getMonth(), value.getDate())
  if (!isValid(parsed)) return undefined
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
}

export default function DatePicker({
  value,
  onChange,
  minDate,
  placeholder = 'Pick a date',
  disabled,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = normalizeDate(value)
  const min = normalizeDate(minDate)
  const disabledDays: Matcher | undefined = min ? { before: min } : undefined

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
          <span className="truncate">{selected ? format(selected, 'dd.MM.yyyy') : placeholder}</span>
          <CalendarIcon className="h-4 w-4 text-gray-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[120] w-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl"
        align="start"
        sideOffset={8}
      >
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? min ?? new Date()}
          fixedWeeks
          onSelect={(date) => {
            onChange(date ? format(date, 'yyyy-MM-dd') : '')
            if (date) setOpen(false)
          }}
          disabled={disabledDays}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
