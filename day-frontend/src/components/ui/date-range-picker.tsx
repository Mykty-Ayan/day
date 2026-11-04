import { useState } from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { isDayBlocked, pickStayDay } from '../../lib/booking-dates'
import { Calendar } from './calendar'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

type DateLike = string | Date | undefined

interface DateRangePickerProps {
  id?: string
  startDate?: string
  endDate?: string
  onRangeChange: (start: string, end: string) => void
  minDate?: DateLike
  maxDate?: DateLike
  responsiveMonths?: boolean
  months?: 1 | 2
  placeholder?: string
  disabled?: boolean
  className?: string
  error?: boolean
  /** Nights (yyyy-MM-dd) already taken: shown struck through, and a stay cannot cover them. */
  booked?: ReadonlySet<string>
  /** The booked nights for the days on screen are still loading: no day can be picked yet. */
  bookedLoading?: boolean
  /** The booked nights could not be loaded: no day can be picked, and `onBookedRetry` asks again. */
  bookedFailed?: boolean
  onBookedRetry?: () => void
  /** The first month on screen, on open and on every page turn: to load its booked nights. */
  onMonthChange?: (month: Date) => void
  /** One day may be both ends: a period of days, not a stay of nights. */
  allowSameDay?: boolean
}

const NO_NIGHTS: ReadonlySet<string> = new Set()
const day = (date: Date) => format(date, 'yyyy-MM-dd')

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
  id,
  startDate,
  endDate,
  onRangeChange,
  minDate,
  maxDate,
  responsiveMonths = true,
  months,
  placeholder,
  disabled,
  className,
  error,
  booked = NO_NIGHTS,
  bookedLoading = false,
  bookedFailed = false,
  onBookedRetry,
  onMonthChange,
  allowSameDay = false,
}: DateRangePickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const isMdUp = useMediaQuery('(min-width: 768px)')
  const start = normalizeDate(startDate)
  const end = normalizeDate(endDate)
  const min = normalizeDate(minDate)
  const max = normalizeDate(maxDate)
  const numberOfMonths =
    months ?? (responsiveMonths ? (isMdUp ? 2 : 1) : 2)

  const selected: DateRange | undefined =
    start ? { from: start, to: end } : undefined

  // The click decides, not the range react-day-picker proposes: it would stretch
  // a picked stay across booked nights instead of starting a new one.
  function handleSelect(_range: DateRange | undefined, clicked: Date) {
    const next = pickStayDay(start ? day(start) : '', end ? day(end) : '', day(clicked), { sameDay: allowSameDay })
    onRangeChange(next.checkIn, next.checkOut)
    if (next.checkOut) {
      setOpen(false)
    }
  }

  const defaultMonth = start ?? min ?? new Date()
  const checkIn = start && !end ? day(start) : null

  function handleOpenChange(next: boolean) {
    if (next) onMonthChange?.(defaultMonth)
    setOpen(next)
  }

  let label = placeholder ?? t('common.selectDates')
  if (start && end) {
    // Include the year on both ends when they span different years to avoid ambiguity.
    const fmt = start.getFullYear() === end.getFullYear() ? 'dd.MM' : 'dd.MM.yy'
    label = `${format(start, fmt)} → ${format(end, fmt)}`
  } else if (start) {
    label = `${format(start, 'dd.MM')} → ...`
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-11 w-full items-center justify-between rounded-xl border border-line bg-surface-card px-3 py-2 text-sm text-ink',
            'focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
            !startDate && !endDate && 'text-ink-muted',
            error && 'border-danger',
            className,
          )}
        >
          <span className="truncate">{label}</span>
          <CalendarIcon className="h-4 w-4 text-ink-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-popover w-auto max-w-[calc(100vw-1rem)] overflow-x-hidden rounded-2xl border border-line bg-surface-card p-2 shadow-xl"
        align="start"
        sideOffset={8}
      >
        <Calendar
          mode="range"
          classNames={{ selected: '' }}
          selected={selected}
          defaultMonth={defaultMonth}
          onMonthChange={onMonthChange}
          showOutsideDays={false}
          pagedNavigation
          min={allowSameDay ? 0 : 1}
          onSelect={handleSelect}
          disabled={
            bookedLoading || bookedFailed || [...(min ? [{ before: min }] : []), ...(max ? [{ after: max }] : []), (date: Date) => isDayBlocked(day(date), booked, checkIn)]
          }
          modifiers={{ booked: (date: Date) => booked.has(day(date)) }}
          modifiersClassNames={{ booked: '[&>button]:line-through' }}
          numberOfMonths={numberOfMonths}
          initialFocus
        />
        {/* Below the calendar: its month navigation overlays the top edge. */}
        {bookedFailed && (
          <p role="alert" className="px-2 pb-2 text-xs text-red-600">
            {t('bookings.bookedNightsFailed')}{' '}
            <button type="button" onClick={onBookedRetry} className="font-semibold underline">
              {t('common.retry')}
            </button>
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
