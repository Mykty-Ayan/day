import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react'
import { useQueries } from '@tanstack/react-query'
import { useGanttData } from '../../hooks/useBookings'
import { getPricing } from '../../api/properties'
import GanttChart from '../../components/property/GanttChart'
import type { GanttRow } from '../../components/property/GanttChart'
import type { PricingConfig } from '../../types/property'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

type RowsPerPage = '10' | '25' | '50' | 'all'

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function GanttChartPage() {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth())
  const [rowsPerPage, setRowsPerPage] = useState<RowsPerPage>('25')
  const [page, setPage] = useState(1)

  const rangeStartDate = useMemo(() => new Date(year, month - 1, 1), [year, month])
  const rangeEndDate = useMemo(() => new Date(year, month + 2, 0), [year, month])
  const startDate = toDateStr(rangeStartDate)
  const endDate = toDateStr(rangeEndDate)

  const { data: ganttData, isLoading } = useGanttData(startDate, endDate)

  const rows: GanttRow[] = useMemo(() => {
    if (!ganttData) return []
    return ganttData.properties.map((p) => ({
      property: p,
      bookings: p.bookings,
    }))
  }, [ganttData])

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.property.internal_name.localeCompare(b.property.internal_name)),
    [rows],
  )

  const pageSize = rowsPerPage === 'all' ? sortedRows.length || 1 : Number(rowsPerPage)
  const totalPages = rowsPerPage === 'all' ? 1 : Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const currentPage = rowsPerPage === 'all' ? 1 : Math.min(page, totalPages)

  const visibleRows = useMemo(() => {
    if (rowsPerPage === 'all') return sortedRows
    const start = (currentPage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [currentPage, pageSize, rowsPerPage, sortedRows])

  const visiblePropertyIds = useMemo(
    () => visibleRows.map((row) => row.property.id),
    [visibleRows],
  )

  const pricingQueries = useQueries({
    queries: visiblePropertyIds.map((propertyId) => ({
      queryKey: ['pricing', propertyId],
      queryFn: () => getPricing(propertyId),
      staleTime: 60_000,
    })),
  })

  const pricingByProperty = useMemo(() => {
    return visiblePropertyIds.reduce<Record<string, PricingConfig | null | undefined>>(
      (acc, propertyId, index) => {
        acc[propertyId] = pricingQueries[index]?.data
        return acc
      },
      {},
    )
  }, [pricingQueries, visiblePropertyIds])

  const rangeStart = sortedRows.length === 0
    ? 0
    : rowsPerPage === 'all'
      ? 1
      : (currentPage - 1) * pageSize + 1
  const rangeEnd = rowsPerPage === 'all'
    ? sortedRows.length
    : Math.min(currentPage * pageSize, sortedRows.length)

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
    const now = new Date()
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

        <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-center md:justify-between">
          <p className="text-xs font-semibold text-gray-500">
            Showing {rangeStart}-{rangeEnd} of {sortedRows.length} properties
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500">Rows</span>
              <Select
                value={rowsPerPage}
                onValueChange={(value) => {
                  setRowsPerPage(value as RowsPerPage)
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-9 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {rowsPerPage !== 'all' && totalPages > 1 && (
              <div className="flex items-center gap-2">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                  className="p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </motion.button>
                <span className="text-xs font-bold text-gray-500 px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </motion.button>
              </div>
            )}
          </div>
        </div>

        {/* Chart */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
          </div>
        ) : (
          <GanttChart
            rows={visibleRows}
            year={year}
            month={month}
            rangeStart={startDate}
            rangeEnd={endDate}
            pricingByProperty={pricingByProperty}
          />
        )}
      </motion.div>
    </div>
  )
}
