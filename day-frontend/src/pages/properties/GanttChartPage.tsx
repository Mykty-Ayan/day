import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react'
import { useQueries } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useGanttData } from '../../hooks/useBookings'
import { getPricing } from '../../api/properties'
import GanttChart from '../../components/property/GanttChart'
import type { GanttRow } from '../../components/property/GanttChart'
import type { PricingConfig } from '../../types/property'
import Spinner from '../../components/ui/Spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import GanttAgendaView from '../../components/property/GanttAgendaView'

// Month keys match gantt.months translation keys (0-11)

type RowsPerPage = '10' | '25' | '50' | 'all'
type GanttViewMode = 'agenda' | 'gantt'

interface PendingSelection {
  propertyId: string
  checkIn: string
}

const GANTT_VIEW_MODE_STORAGE_KEY = 'day:gantt:view-mode'

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

function addDays(dateStr: string, days: number): string {
  const date = parseDateOnly(dateStr)
  date.setDate(date.getDate() + days)
  return toDateStr(date)
}

function readInitialViewMode(): GanttViewMode {
  if (typeof window === 'undefined') return 'gantt'

  try {
    const stored = window.localStorage.getItem(GANTT_VIEW_MODE_STORAGE_KEY)
    if (stored === 'agenda' || stored === 'gantt') {
      return stored
    }
  } catch {
    // Ignore read errors and fallback to responsive default.
  }

  return window.matchMedia('(max-width: 1023px)').matches ? 'agenda' : 'gantt'
}

export default function GanttChartPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth())
  const [todayScrollNonce, setTodayScrollNonce] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState<RowsPerPage>('25')
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<GanttViewMode>(() => readInitialViewMode())
  // Keeps the first click state for the 2-step check-in/check-out flow.
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(GANTT_VIEW_MODE_STORAGE_KEY, viewMode)
    } catch {
      // Ignore storage write errors.
    }
  }, [viewMode])

  const rangeStartDate = useMemo(() => new Date(year, month - 1, 1), [year, month])
  const rangeEndDate = useMemo(() => new Date(year, month + 2, 0), [year, month])
  const startDate = toDateStr(rangeStartDate)
  const endDate = toDateStr(rangeEndDate)

  const {
    data: ganttData,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useGanttData(startDate, endDate)

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
    queries: viewMode === 'gantt'
      ? visiblePropertyIds.map((propertyId) => ({
          queryKey: ['pricing', propertyId],
          queryFn: () => getPricing(propertyId),
          staleTime: 60_000,
        }))
      : [],
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

  function handleCellClick(propertyId: string, date: string) {
    // First click selects check-in, second valid click on the same row selects check-out.
    if (!pendingSelection || pendingSelection.propertyId !== propertyId) {
      setPendingSelection({ propertyId, checkIn: date })
      return
    }

    if (date === pendingSelection.checkIn) {
      setPendingSelection(null)
      navigate({
        to: '/bookings/new',
        search: {
          property_id: propertyId,
          check_in: date,
          check_out: addDays(date, 1),
          from: 'gantt',
        } as Record<string, string>,
      })
      return
    }

    if (date < pendingSelection.checkIn) {
      setPendingSelection({ propertyId, checkIn: date })
      return
    }

    const checkIn = pendingSelection.checkIn
    setPendingSelection(null)
    navigate({
      to: '/bookings/new',
      search: {
        property_id: propertyId,
        check_in: checkIn,
        check_out: date,
        from: 'gantt',
      } as Record<string, string>,
    })
  }

  function prevMonth() {
    setPendingSelection(null)
    if (month === 0) {
      setMonth(11)
      setYear((y) => y - 1)
    } else {
      setMonth((m) => m - 1)
    }
  }

  function nextMonth() {
    setPendingSelection(null)
    if (month === 11) {
      setMonth(0)
      setYear((y) => y + 1)
    } else {
      setMonth((m) => m + 1)
    }
  }

  function goToday() {
    setPendingSelection(null)
    const now = new Date()
    setYear(now.getFullYear())
    setMonth(now.getMonth())
    setTodayScrollNonce((n) => n + 1)
  }

  return (
    <div className="max-w-full px-4 py-4 sm:px-6 sm:py-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <CalendarRange className="h-5 w-5 text-gray-900" />
            <h1 className="text-xl font-bold text-gray-900">{t('gantt.title')}</h1>
          </div>

          {/* Month navigation */}
          <div className="flex flex-wrap items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={goToday}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-100"
            >
              {t('gantt.today')}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={prevMonth}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </motion.button>
            <span className="min-w-[140px] text-center text-sm font-bold text-gray-900">
              {t(`gantt.months.${month}`)} {year}
            </span>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={nextMonth}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <ChevronRight className="h-4 w-4" />
            </motion.button>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3">
          <div className="w-full overflow-x-auto sm:w-auto">
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(value) => {
                if (!value) return
                setPendingSelection(null)
                setViewMode(value as GanttViewMode)
              }}
              className="min-w-max"
            >
              <ToggleGroupItem value="agenda">{t('gantt.agenda')}</ToggleGroupItem>
              <ToggleGroupItem value="gantt">{t('gantt.title')}</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-xs font-semibold text-gray-500">
              {t('common.showing', { start: rangeStart, end: rangeEnd, total: sortedRows.length })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500">{t('common.rows')}</span>
                <Select
                  value={rowsPerPage}
                  onValueChange={(value) => {
                    setPendingSelection(null)
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
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {rowsPerPage !== 'all' && totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setPendingSelection(null)
                      setPage(Math.max(1, currentPage - 1))
                    }}
                    disabled={currentPage <= 1}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </motion.button>
                  <span className="px-2 text-xs font-bold text-gray-500">
                    {t('common.page', { current: currentPage, total: totalPages })}
                  </span>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      setPendingSelection(null)
                      setPage(Math.min(totalPages, currentPage + 1))
                    }}
                    disabled={currentPage >= totalPages}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </motion.button>
                </div>
              )}
            </div>
          </div>
        </div>

        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-100 bg-red-50/50 py-10">
            <p className="text-sm font-semibold text-red-700">{t('gantt.failedLoad')}</p>
            {error instanceof Error && (
              <p className="max-w-xl px-4 text-center text-xs text-red-500">{error.message}</p>
            )}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                void refetch()
              }}
              disabled={isFetching}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
            >
              {t('common.retry')}
            </motion.button>
          </div>
        ) : viewMode === 'agenda' ? (
          <GanttAgendaView rows={visibleRows} rangeStart={startDate} rangeEnd={endDate} />
        ) : (
          <GanttChart
            mode={viewMode}
            rows={visibleRows}
            year={year}
            month={month}
            rangeStart={startDate}
            rangeEnd={endDate}
            todayScrollNonce={todayScrollNonce}
            pricingByProperty={pricingByProperty}
            onCellClick={handleCellClick}
            pendingSelection={pendingSelection}
          />
        )}
      </motion.div>
    </div>
  )
}
