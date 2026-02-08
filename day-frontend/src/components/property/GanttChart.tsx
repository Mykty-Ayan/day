import { useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import type { Property } from '../../types/property'

export interface GanttRow {
  property: Property
  bookings?: unknown[]
}

interface Props {
  rows: GanttRow[]
  year: number
  month: number
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = []
  const date = new Date(year, month, 1)
  while (date.getMonth() === month) {
    days.push(new Date(date))
    date.setDate(date.getDate() + 1)
  }
  return days
}

const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function GanttChart({ rows, year, month }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const days = useMemo(() => getDaysInMonth(year, month), [year, month])
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.property.internal_name.localeCompare(b.property.internal_name)),
    [rows],
  )

  const CELL_W = 40
  const NAME_W = 180
  const ROW_H = 40

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm"
    >
      <div className="flex">
        {/* Fixed property names column */}
        <div className="shrink-0 border-r border-gray-200 bg-white z-10" style={{ width: NAME_W }}>
          {/* Header cell */}
          <div
            className="flex items-center px-3 border-b border-gray-200 bg-gray-50"
            style={{ height: ROW_H }}
          >
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Property
            </span>
          </div>
          {/* Property name rows */}
          {sortedRows.map((row) => (
            <div
              key={row.property.id}
              className="flex items-center px-3 border-b border-gray-100"
              style={{ height: ROW_H }}
            >
              <span className="text-sm font-bold text-gray-900 truncate">
                {row.property.internal_name}
              </span>
            </div>
          ))}
        </div>

        {/* Scrollable dates area */}
        <div ref={scrollRef} className="overflow-x-auto flex-1">
          <div style={{ width: days.length * CELL_W }}>
            {/* Date header */}
            <div className="flex border-b border-gray-200" style={{ height: ROW_H }}>
              {days.map((day) => {
                const isWeekend = day.getDay() === 0 || day.getDay() === 6
                const isToday =
                  `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}` === todayStr
                return (
                  <div
                    key={day.getDate()}
                    className={`shrink-0 flex flex-col items-center justify-center border-r border-gray-100 ${
                      isToday ? 'bg-blue-50' : isWeekend ? 'bg-gray-50' : ''
                    }`}
                    style={{ width: CELL_W }}
                  >
                    <span className="text-[10px] text-gray-400">
                      {weekdayNames[day.getDay()]}
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        isToday ? 'text-blue-600' : 'text-gray-500'
                      }`}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Grid rows */}
            {sortedRows.map((row) => (
              <div key={row.property.id} className="flex border-b border-gray-100 relative">
                {days.map((day) => {
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6
                  const isToday =
                    `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}` === todayStr
                  return (
                    <div
                      key={day.getDate()}
                      className={`shrink-0 border-r border-gray-100 ${
                        isToday
                          ? 'bg-blue-50 border-l-2 border-l-blue-200'
                          : isWeekend
                            ? 'bg-gray-50'
                            : ''
                      }`}
                      style={{ width: CELL_W, height: ROW_H }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {sortedRows.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-gray-500">No properties to display</p>
        </div>
      )}
    </motion.div>
  )
}
