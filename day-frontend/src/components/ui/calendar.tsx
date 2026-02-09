import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'space-y-4',
        caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-semibold text-gray-900',
        nav: 'flex items-center gap-1',
        nav_button:
          'h-7 w-7 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
        nav_button_previous: 'absolute left-1',
        nav_button_next: 'absolute right-1',
        table: 'w-full border-collapse space-y-1',
        head_row: 'flex',
        head_cell: 'w-9 text-center text-[0.7rem] font-semibold text-gray-400',
        row: 'flex w-full mt-2',
        cell: 'h-9 w-9 text-center text-sm p-0 relative',
        day:
          'h-9 w-9 rounded-lg font-medium text-gray-700 hover:bg-gray-100 focus:outline-none',
        day_selected:
          'bg-black text-white hover:bg-black focus:bg-black',
        day_today: 'bg-gray-100 text-gray-900',
        day_outside: 'text-gray-400 opacity-70',
        day_disabled: 'text-gray-300 opacity-50',
        day_hidden: 'invisible',
        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  )
}
Calendar.displayName = 'Calendar'

export { Calendar }
