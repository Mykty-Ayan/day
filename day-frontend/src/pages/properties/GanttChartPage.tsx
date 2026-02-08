import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react'
import { useGanttData } from '../../hooks/useBookings'
import GanttChart from '../../components/property/GanttChart'
import type { GanttRow } from '../../components/property/GanttChart'

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function GanttChartPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const startDate = toDateStr(new Date(year, month, 1))
  const endDate = toDateStr(new Date(year, month + 1, 0))

  const { data: ganttData, isLoading } = useGanttData(startDate, endDate)

  const rows: GanttRow[] = useMemo(() => {
    if (!ganttData) return []
    return ganttData.properties.map((p) => ({
      property: p.property,
      bookings: p.bookings,
    }))
  }, [ganttData])

  function prevMonth() {
    if (month === 0) {
      setMonth(11)
      setYear((y) => y - 1)
    } else {
      setMonth((m) => m - 1)
    }
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0)
      setYear((y) => y + 1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  function goToday() {
    setYear(now.getFullYear())
    setMonth(now.getMonth())
  }

  return (
    <div className="p-6 max-w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <CalendarRange className="w-5 h-5 text-gray-900" />
            <h1 className="text-xl font-bold text-gray-900">Chess Chart</h1>
          </div>

          {/* Month navigation */}
          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={goToday}
              className="bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 transition-colors"
            >
              Today
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={prevMonth}
              className="p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </motion.button>
            <span className="text-sm font-bold text-gray-900 min-w-[140px] text-center">
              {monthNames[month]} {year}
            </span>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={nextMonth}
              className="p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <ChevronRight className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* Chart */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
          </div>
        ) : (
          <GanttChart rows={rows} year={year} month={month} />
        )}
      </motion.div>
    </div>
  )
}
