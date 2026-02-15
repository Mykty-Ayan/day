import * as React from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import { cn } from '../../lib/utils'

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months: 'flex flex-col gap-4',
        month: 'space-y-3',
        month_caption: 'relative flex h-8 items-center justify-center',
        caption_label: 'text-sm font-semibold text-gray-900',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between px-1',
        button_previous:
          'h-7 w-7 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50',
        button_next:
          'h-7 w-7 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-center text-[0.7rem] font-semibold text-gray-400',
        weeks: 'space-y-1',
        week: 'flex w-full',
        day: 'h-9 w-9 p-0 text-center text-sm',
        day_button:
          'h-9 w-9 rounded-lg font-medium text-gray-700 hover:bg-gray-100 focus:outline-none',
        selected: 'bg-black text-white hover:bg-black focus:bg-black',
        today: 'bg-gray-100 text-gray-900',
        outside: 'text-gray-400 opacity-70',
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
