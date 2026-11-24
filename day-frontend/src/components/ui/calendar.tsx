import * as React from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import { enUS, kk, ru } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const { i18n } = useTranslation()
  const language = i18n.language.toLowerCase()
  const locale = language.startsWith('ru')
    ? ru
    : language.startsWith('kz') || language.startsWith('kk')
      ? kk
      : enUS

  return (
    <DayPicker
      locale={locale}
      showOutsideDays={showOutsideDays}
      className={cn('p-2', className)}
      classNames={{
        // Relative: the arrows sit in the caption's row, not at the popover's corners.
        months: 'relative flex flex-col gap-4 sm:flex-row',
        month: 'space-y-2',
        month_caption: 'flex h-10 items-center justify-center',
        caption_label: 'text-sm font-bold capitalize text-ink',
        // Above the month caption, which would take the arrows' clicks.
        nav: 'absolute inset-x-0 top-0 z-10 flex h-10 items-center justify-between',
        button_previous:
          'flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-page hover:text-ink disabled:opacity-40',
        button_next:
          'flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-page hover:text-ink disabled:opacity-40',
        month_grid: 'w-full border-collapse',
        weekdays: 'grid grid-cols-7',
        weekday: 'h-8 text-center text-[11px] font-semibold uppercase text-ink-muted',
        weeks: 'space-y-1',
        // No gap: a picked range reads as one band.
        week: 'grid grid-cols-7',
        day: 'p-0 text-center text-sm',
        day_button:
          'flex h-11 w-full min-w-10 items-center justify-center rounded-lg font-medium text-ink transition-colors hover:bg-surface-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:h-10',
        today: '[&>button]:font-bold [&>button]:text-accent-ink',
        // A single day. A range picker turns it off and styles its ends and middle instead.
        selected: '[&>button]:bg-accent [&>button]:text-white [&>button]:hover:bg-accent-hover',
        range_start: '[&>button]:bg-accent [&>button]:text-white [&>button]:hover:bg-accent-hover',
        range_end: '[&>button]:bg-accent [&>button]:text-white [&>button]:hover:bg-accent-hover',
        range_middle: 'bg-accent-soft [&>button]:rounded-none [&>button]:text-accent-ink [&>button]:hover:bg-transparent',
        outside: '[&>button]:text-ink-muted/50',
        disabled: '[&>button]:cursor-not-allowed [&>button]:text-ink-muted/40 [&>button]:hover:bg-transparent',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ className, orientation }) => {
          if (orientation === 'left') {
            return <ChevronLeft className={cn('h-4 w-4', className)} />
          }
          if (orientation === 'right') {
            return <ChevronRight className={cn('h-4 w-4', className)} />
          }
          if (orientation === 'up') {
            return <ChevronUp className={cn('h-4 w-4', className)} />
          }
          return <ChevronDown className={cn('h-4 w-4', className)} />
        },
      }}
      {...props}
    />
  )
}
Calendar.displayName = 'Calendar'

export { Calendar }
