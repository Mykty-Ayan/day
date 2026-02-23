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
        months: 'flex flex-col gap-4 sm:flex-row',
        month: 'space-y-4',
        month_caption: 'relative flex h-10 items-center justify-center px-9',
        caption_label: 'text-base font-semibold tracking-tight text-gray-900',
        nav: 'absolute inset-x-0 top-0 flex h-10 items-center justify-between px-1',
        button_previous:
          'h-8 w-8 rounded-xl border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50',
        button_next:
          'h-8 w-8 rounded-xl border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50',
        month_grid: 'w-full border-collapse',
        weekdays: 'grid grid-cols-7 gap-1',
        weekday: 'h-8 text-center text-xs font-semibold uppercase tracking-wide text-gray-400',
        weeks: 'space-y-1',
        week: 'grid grid-cols-7 gap-1',
        day: 'p-0 text-center text-sm',
        day_button:
          'h-10 w-10 rounded-xl font-medium text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15',
        selected:
          'bg-black text-white hover:bg-black [&>button]:bg-black [&>button]:text-white [&>button]:shadow-sm [&>button]:hover:bg-black',
        today:
          'bg-gray-100 text-gray-900 font-semibold [&>button]:bg-gray-100 [&>button]:text-gray-900 [&>button]:font-semibold',
        outside: 'text-gray-400 opacity-70 [&>button]:text-gray-400 [&>button]:opacity-70',
        range_start:
          'bg-black text-white [&>button]:bg-black [&>button]:text-white [&>button]:hover:bg-black',
        range_end:
          'bg-black text-white [&>button]:bg-black [&>button]:text-white [&>button]:hover:bg-black',
        range_middle: 'bg-gray-100 text-gray-900 [&>button]:bg-gray-100 [&>button]:text-gray-900',
        disabled: 'text-gray-300 opacity-50',
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
