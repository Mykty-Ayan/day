import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { Booking, BookingStatus, GanttPropertySummary } from '../../types/booking'
import type { PricingConfig } from '../../types/property'
import { showToast } from '../ui/Toast'
import { moveBooking } from '../../api/bookings'
import { useQueryClient } from '@tanstack/react-query'
import { useCurrency } from '../../hooks/useCurrency'

export interface GanttRow {
  property: GanttPropertySummary
  bookings: Booking[]
}

interface Props {
  rows: GanttRow[]
  year: number
  month: number
  rangeStart: string
  rangeEnd: string
  pricingByProperty?: Record<string, PricingConfig | null | undefined>
  onCellClick?: (propertyId: string, date: string) => void
  pendingSelection?: {
    propertyId: string
    checkIn: string
  } | null
}

function getDaysInRange(start: Date, end: Date): Date[] {
  const days: Date[] = []
  const date = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  while (date <= end) {
    days.push(new Date(date))
    date.setDate(date.getDate() + 1)
  }
  return days
}

// Weekday and month names are loaded via i18n inside the component

const CELL_W = 40
const NAME_W = 180
const MONTH_ROW_H = 24
const ROW_H = 40
const BAR_H = 28
const BAR_Y = (ROW_H - BAR_H) / 2
const MONTH_LABEL_W = 92
const MONTH_LABEL_PAD = 6

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

function isBookedOnDate(bookings: Booking[], day: Date): boolean {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate())
  return bookings.some((booking) => {
    const checkIn = parseDateOnly(booking.check_in)
    const checkOut = parseDateOnly(booking.check_out)
    return checkIn <= dayStart && dayStart < checkOut
  })
}

function getNightlyRateForDate(
  pricing: PricingConfig | null | undefined,
  day: Date,
): number | null {
  if (!pricing) return null

  let nightlyRate = pricing.base_price
  const dayStr = toDateStr(day)

  const seasonal = pricing.seasonal_prices.find(
    (season) => season.start_date <= dayStr && dayStr <= season.end_date,
  )
  if (seasonal) nightlyRate = seasonal.price

  // Align with backend calculator: weekend markup applies to Fri/Sat nights.
  if ((day.getDay() === 5 || day.getDay() === 6) && pricing.weekend_markup > 0) {
    nightlyRate += pricing.weekend_markup
  }

  return nightlyRate
}

function formatCellPrice(value: number, sym: string): string {
  if (value >= 10000) return `${sym}${Math.round(value / 1000)}k`
  if (value >= 1000) {
    const short = value / 1000
    return `${sym}${Number.isInteger(short) ? short : short.toFixed(1)}k`
  }
  return `${sym}${Math.round(value)}`
}

function getStatusBarStyle(status: BookingStatus): string {
  switch (status) {
    case 'pending': return 'border-dashed border-2 border-white/50'
    case 'confirmed': return ''
    case 'checked_in': return ''
    case 'checked_out': return 'opacity-70'
    case 'completed': return 'opacity-60'
    case 'cancelled': return 'opacity-40'
    default: return ''
  }
}

function getMonthLabel(date: Date, monthNames: string[]): string {
  return `${monthNames[date.getMonth()]} ${date.getFullYear()}`
}

function formatPreviewDate(dateStr: string, monthNames: string[]): string {
  const d = parseDateOnly(dateStr)
  return `${monthNames[d.getMonth()]} ${d.getDate()}`
}

// formatNights is handled via i18n inside the component

function getBookingNights(checkIn: string, checkOut: string): number {
  const start = parseDateOnly(checkIn).getTime()
  const end = parseDateOnly(checkOut).getTime()
  const nights = Math.round((end - start) / (24 * 60 * 60 * 1000))
  return Math.max(0, nights)
}

function formatBookingDateRangeShort(checkIn: string, checkOut: string, monthNames: string[]): string {
  const start = parseDateOnly(checkIn)
  const end = parseDateOnly(checkOut)

  if (end < start) {
    return `${start.getDate()} ${monthNames[start.getMonth()]}`
  }

  const sameYear = start.getFullYear() === end.getFullYear()
  const sameMonth = sameYear && start.getMonth() === end.getMonth()

  if (sameMonth) {
    return `${start.getDate()}-${end.getDate()} ${monthNames[start.getMonth()]}`
  }

  const startPart = `${start.getDate()} ${monthNames[start.getMonth()]}`
  const endPart = sameYear
    ? `${end.getDate()} ${monthNames[end.getMonth()]}`
    : `${end.getDate()} ${monthNames[end.getMonth()]} ${end.getFullYear()}`

  return `${startPart} - ${endPart}`
}

function formatTooltipPrice(value: number, sym: string): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) {
    const inMillions = value / 1_000_000
    return `${sym}${Number.isInteger(inMillions) ? inMillions : inMillions.toFixed(1)}m`
  }
  if (abs >= 1_000) {
    const inThousands = value / 1_000
    return `${sym}${Number.isInteger(inThousands) ? inThousands : inThousands.toFixed(1)}k`
  }
  return `${sym}${Math.round(value)}`
}

function formatGuestsCompact(adults: number, children: number): string {
  if (children > 0) return `${adults}A+${children}C`
  return `${adults}A`
}

const tooltipStatusKeys: Record<BookingStatus, string> = {
  pending: 'common.pending',
  confirmed: 'common.confirmed',
  checked_in: 'gantt.inHouse',
  checked_out: 'common.checkedOut',
  completed: 'common.completed',
  cancelled: 'common.cancelled',
}

const tooltipStatusTone: Record<BookingStatus, string> = {
  pending: 'bg-slate-200/20 text-slate-100',
  confirmed: 'bg-sky-300/20 text-sky-100',
  checked_in: 'bg-emerald-300/20 text-emerald-100',
  checked_out: 'bg-amber-300/20 text-amber-100',
  completed: 'bg-green-300/20 text-green-100',
  cancelled: 'bg-rose-300/20 text-rose-100',
}

const sourceKeys: Record<Booking['source'], string> = {
  direct: 'common.direct',
  booking: 'gantt.sourceBcom',
  airbnb: 'common.airbnb',
  other: 'common.other',
}

export default function GanttChart({
  rows,
  year,
  month,
  rangeStart,
  rangeEnd,
  pricingByProperty,
  onCellClick,
  pendingSelection,
}: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { symbol: currencySymbol } = useCurrency()
  const scrollRef = useRef<HTMLDivElement>(null)

  const weekdayNames = useMemo(() => Array.from({ length: 7 }, (_, i) => t(`gantt.weekdays.${i}`)), [t])
  const shortMonthNames = useMemo(() => Array.from({ length: 12 }, (_, i) => t(`gantt.monthsShort.${i}`)), [t])
  const autoScrollKeyRef = useRef<string | null>(null)
  const rangeStartDate = useMemo(() => parseDateOnly(rangeStart), [rangeStart])
  const rangeEndDate = useMemo(() => parseDateOnly(rangeEnd), [rangeEnd])
  const days = useMemo(
    () => getDaysInRange(rangeStartDate, rangeEndDate),
    [rangeStartDate, rangeEndDate],
  )
  const today = new Date()
  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth()
  const todayStr = toDateStr(today)

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.property.internal_name.localeCompare(b.property.internal_name)),
    [rows],
  )
  const propertyStatusById = useMemo(
    () =>
      sortedRows.reduce<Record<string, GanttPropertySummary['status']>>((acc, row) => {
        acc[row.property.id] = row.property.status
        return acc
      }, {}),
    [sortedRows],
  )
  const monthSegments = useMemo(() => {
    if (days.length === 0) return []

    const segments: Array<{
      key: string
      label: string
      daysCount: number
    }> = []
    let currentMonth = days[0].getMonth()
    let currentYear = days[0].getFullYear()
    let start = 0

    for (let i = 1; i <= days.length; i += 1) {
      const day = days[i]
      const changed =
        i === days.length ||
        day.getMonth() !== currentMonth ||
        day.getFullYear() !== currentYear

      if (changed) {
        const firstDate = days[start]
        const daysCount = i - start
        segments.push({
          key: `${currentYear}-${currentMonth}`,
          label: getMonthLabel(firstDate, shortMonthNames),
          daysCount,
        })
        if (i < days.length) {
          currentMonth = day.getMonth()
          currentYear = day.getFullYear()
          start = i
        }
      }
    }

    return segments
  }, [days, shortMonthNames])

  // Tooltip state
  const [tooltip, setTooltip] = useState<{ booking: Booking; x: number; y: number } | null>(null)
  const [hoverPreview, setHoverPreview] = useState<{ propertyId: string; date: string } | null>(null)
  const [rangePreviewTooltip, setRangePreviewTooltip] = useState<{
    left: number
    top: number
    checkIn: string
    checkOut: string
    nights: number
  } | null>(null)

  // Drag state
  const [dragBooking, setDragBooking] = useState<{
    booking: Booking
    sourcePropertyId: string
  } | null>(null)
  const [dragOverPropertyId, setDragOverPropertyId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const scrollKey = `${year}-${month}-${rangeStart}-${rangeEnd}`
    if (autoScrollKeyRef.current === scrollKey) return

    const targetDate = year === todayYear && month === todayMonth
      ? todayStr
      : toDateStr(new Date(year, month, 1))
    const targetIndex = days.findIndex((day) => toDateStr(day) === targetDate)
    if (targetIndex < 0) return

    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)
    const target = Math.min(targetIndex * CELL_W, maxScrollLeft)
    container.scrollLeft = target
    autoScrollKeyRef.current = scrollKey
  }, [days, month, rangeEnd, rangeStart, todayMonth, todayStr, todayYear, year])

  const handleDragStart = useCallback((
    e: React.DragEvent,
    booking: Booking,
    sourcePropertyId: string,
  ) => {
    setDragBooking({ booking, sourcePropertyId })
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', booking.id)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDragBooking(null)
    setDragOverPropertyId(null)
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, propertyId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverPropertyId(propertyId)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverPropertyId(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, targetPropertyId: string) => {
    e.preventDefault()
    setDragOverPropertyId(null)
    setIsDragging(false)

    const targetStatus = propertyStatusById[targetPropertyId]
    if (targetStatus === 'paused') {
      showToast('error', t('gantt.cannotMoveToPaused'))
      setDragBooking(null)
      return
    }

    if (!dragBooking || dragBooking.sourcePropertyId === targetPropertyId) {
      setDragBooking(null)
      return
    }

    try {
      await moveBooking(dragBooking.booking.id, { target_property_id: targetPropertyId })
      queryClient.invalidateQueries({ queryKey: ['gantt-data'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      showToast('success', t('gantt.bookingMoved'))
    } catch {
      showToast('error', t('gantt.failedMoveBooking'))
    }

    setDragBooking(null)
  }, [dragBooking, propertyStatusById, queryClient, t])

  // Active preview end date while hovering after selecting check-in.
  const pendingPreviewEnd = useMemo(() => {
    if (!pendingSelection || !hoverPreview) return null
    if (hoverPreview.propertyId !== pendingSelection.propertyId) return null
    if (hoverPreview.date <= pendingSelection.checkIn) return null
    return hoverPreview.date
  }, [hoverPreview, pendingSelection])

  function getBarPosition(booking: Booking): { left: number; width: number } | null {
    const checkIn = parseDateOnly(booking.check_in)
    const checkOut = parseDateOnly(booking.check_out)
    const rangeEndExclusive = new Date(
      rangeEndDate.getFullYear(),
      rangeEndDate.getMonth(),
      rangeEndDate.getDate() + 1,
    )

    // Booking range is [check_in, check_out). Skip if no overlap with visible range.
    if (checkIn >= rangeEndExclusive || checkOut <= rangeStartDate) return null

    const visibleStart = checkIn < rangeStartDate ? rangeStartDate : checkIn
    const visibleEnd = checkOut > rangeEndExclusive ? rangeEndExclusive : checkOut

    const startDayOffset = Math.floor(
      (visibleStart.getTime() - rangeStartDate.getTime()) / 86400000,
    )
    const endDayOffset = Math.floor(
      (visibleEnd.getTime() - rangeStartDate.getTime()) / 86400000,
    )

    const left = startDayOffset * CELL_W
    const width = Math.max((endDayOffset - startDayOffset) * CELL_W, CELL_W * 0.5)

    return { left, width }
  }

  function handleCellClick(property: GanttPropertySummary, day: Date) {
    if (property.status === 'paused') {
      showToast('error', t('gantt.pausedUnavailable'))
      return
    }
    const dateStr = toDateStr(day)
    if (onCellClick) {
      onCellClick(property.id, dateStr)
    } else {
      navigate({
        to: '/bookings/new',
        search: {
          property_id: property.id,
          check_in: dateStr,
          from: 'gantt',
        } as Record<string, string>,
      })
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm relative"
    >
      <div className="flex">
        {/* Fixed property names column */}
        <div className="shrink-0 border-r border-gray-200 bg-white z-10" style={{ width: NAME_W }}>
          <div
            className="border-b border-gray-200 bg-gray-50"
            style={{ height: MONTH_ROW_H }}
          />
          {/* Header cell */}
          <div
            className="flex items-center px-3 border-b border-gray-200 bg-gray-50"
            style={{ height: ROW_H }}
          >
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              {t('gantt.property')}
            </span>
          </div>
          {/* Property name rows */}
          {sortedRows.map((row) => {
            const isPaused = row.property.status === 'paused'
            return (
              <div
                key={row.property.id}
                className={`flex items-center gap-2 px-3 border-b border-gray-100 transition-colors ${
                  isPaused ? 'bg-amber-50/60' : ''
                } ${
                  !isPaused && isDragging && dragOverPropertyId === row.property.id
                    ? 'bg-blue-50'
                    : isDragging
                      ? 'bg-gray-50/50'
                      : ''
                }`}
                style={{ height: ROW_H }}
                onDragOver={(e) => {
                  if (!isPaused) handleDragOver(e, row.property.id)
                }}
                onDragLeave={handleDragLeave}
                onDrop={(e) => {
                  if (!isPaused) handleDrop(e, row.property.id)
                }}
              >
                <span className={`text-sm font-bold truncate ${isPaused ? 'text-amber-900' : 'text-gray-900'}`}>
                  {row.property.internal_name}
                </span>
                {isPaused && (
                  <span className="shrink-0 rounded-md border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                    {t('common.paused')}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Scrollable dates area */}
        <div
          ref={scrollRef}
          className="overflow-x-auto flex-1"
        >
          <div style={{ width: days.length * CELL_W }}>
            <div className="relative border-b border-gray-200 bg-gray-50" style={{ height: MONTH_ROW_H }}>
              <div className="flex h-full">
                {monthSegments.map((segment, idx) => (
                  <div
                    key={segment.key}
                    className={`relative box-border shrink-0 overflow-clip ${
                      idx > 0 ? 'border-l border-l-gray-300' : ''
                    } ${
                      idx % 2 === 0 ? 'bg-gray-50' : 'bg-gray-100/60'
                    }`}
                    style={{ width: segment.daysCount * CELL_W }}
                  >
                    <div
                      className="sticky z-10 flex h-full items-center pointer-events-none"
                      style={{ left: MONTH_LABEL_PAD, width: MONTH_LABEL_W }}
                    >
                      <span className="block truncate rounded-md border border-gray-200 bg-white/90 px-2 py-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-600 shadow-[0_1px_1px_rgba(0,0,0,0.06)]">
                        {segment.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Date header */}
            <div className="flex border-b border-gray-200" style={{ height: ROW_H }}>
              {days.map((day) => {
                const dayKey = toDateStr(day)
                const isWeekend = day.getDay() === 0 || day.getDay() === 6
                const isToday = toDateStr(day) === todayStr
                const isMonthStart = day.getDate() === 1
                return (
                  <div
                    key={dayKey}
                    className={`shrink-0 flex flex-col items-center justify-center border-r border-gray-100 ${
                      isMonthStart ? 'border-l border-l-gray-300' : ''
                    } ${
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

            {/* Grid rows with booking bars */}
            {sortedRows.map((row) => {
              const isPaused = row.property.status === 'paused'
              return (
                <div
                  key={row.property.id}
                  className={`flex border-b border-gray-100 relative transition-colors ${
                    isPaused ? 'bg-amber-50/25' : ''
                  } ${
                    !isPaused && isDragging && dragOverPropertyId === row.property.id
                      ? 'bg-blue-50/50'
                      : ''
                  }`}
                  style={{ height: ROW_H }}
                  onDragOver={(e) => {
                    if (!isPaused) handleDragOver(e, row.property.id)
                  }}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => {
                    if (!isPaused) handleDrop(e, row.property.id)
                  }}
                  onMouseLeave={() => {
                    if (hoverPreview?.propertyId === row.property.id) {
                      setHoverPreview(null)
                      setRangePreviewTooltip(null)
                    }
                  }}
                >
                {/* Day cells */}
                {days.map((day) => {
                  const dayKey = toDateStr(day)
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6
                  const isToday = toDateStr(day) === todayStr
                  const isMonthStart = day.getDate() === 1
                  const isPendingRow = pendingSelection?.propertyId === row.property.id
                  const isPendingCheckIn = isPendingRow
                    && pendingSelection.checkIn === dayKey
                  const isPendingRangeDay = Boolean(
                    isPendingRow
                      && pendingSelection
                      && pendingPreviewEnd
                      && pendingSelection.checkIn < dayKey
                      && dayKey < pendingPreviewEnd,
                  )
                  const isPendingCheckOutCandidate = Boolean(
                    isPendingRow
                      && pendingPreviewEnd
                      && dayKey === pendingPreviewEnd,
                  )
                  const hasBooking = isBookedOnDate(row.bookings, day)
                  const nightlyRate = hasBooking
                    ? null
                    : getNightlyRateForDate(pricingByProperty?.[row.property.id], day)
                  return (
                    <div
                      key={dayKey}
                      className={`relative shrink-0 border-r border-gray-100 transition-colors ${
                        isPaused
                          ? 'cursor-not-allowed bg-amber-50/40'
                          : `cursor-pointer ${isPendingRow ? 'hover:bg-violet-100/90' : 'hover:bg-gray-100/50'}`
                      } ${
                        isMonthStart ? 'border-l border-l-gray-300' : ''
                      } ${
                        isToday
                          ? 'bg-blue-50 border-l border-l-blue-200'
                          : isWeekend
                            ? 'bg-gray-50'
                            : ''
                      } ${
                        isPendingRangeDay ? 'bg-emerald-100/70' : ''
                      } ${
                        // Full-cell endpoint highlights make selected dates visible at a glance.
                        isPendingCheckIn
                          ? 'bg-blue-100 ring-2 ring-inset ring-blue-500 border-blue-200'
                          : isPendingCheckOutCandidate
                            ? 'bg-amber-100 ring-2 ring-inset ring-amber-500 border-amber-200'
                          : ''
                      }`}
                      style={{ width: CELL_W, height: '100%' }}
                      onMouseEnter={(e) => {
                        if (isPaused) {
                          setRangePreviewTooltip(null)
                          return
                        }
                        if (!pendingSelection || pendingSelection.propertyId !== row.property.id) {
                          setRangePreviewTooltip(null)
                          return
                        }
                        setHoverPreview((prev) => (
                          prev?.propertyId === row.property.id && prev.date === dayKey
                            ? prev
                            : { propertyId: row.property.id, date: dayKey }
                        ))
                        if (dayKey > pendingSelection.checkIn) {
                          const checkInDate = parseDateOnly(pendingSelection.checkIn)
                          const checkOutDate = parseDateOnly(dayKey)
                          const nights = Math.max(
                            1,
                            Math.round((checkOutDate.getTime() - checkInDate.getTime()) / 86400000),
                          )
                          const cursorX = e.clientX
                          const cursorY = e.clientY
                          const tooltipW = 190
                          const tooltipH = 84
                          const gap = 16
                          const viewportW = window.innerWidth
                          const viewportH = window.innerHeight

                          let left = cursorX + gap
                          let top = cursorY + gap

                          // Flip tooltip near edges so it doesn't cover cursor or exit viewport.
                          if (left + tooltipW > viewportW - 8) {
                            left = cursorX - tooltipW - gap
                          }
                          if (top + tooltipH > viewportH - 8) {
                            top = cursorY - tooltipH - gap
                          }

                          left = Math.max(8, left)
                          top = Math.max(8, top)

                          setRangePreviewTooltip({
                            left,
                            top,
                            checkIn: pendingSelection.checkIn,
                            checkOut: dayKey,
                            nights,
                          })
                        } else {
                          setRangePreviewTooltip(null)
                        }
                      }}
                      onClick={() => handleCellClick(row.property, day)}
                    >
                      {nightlyRate !== null && (
                        <div className="pointer-events-none flex h-full items-end justify-center pb-1">
                          <span className={`text-[9px] font-semibold ${isPaused ? 'text-gray-500' : 'text-emerald-700'}`}>
                            {formatCellPrice(nightlyRate, currencySymbol)}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Booking bars overlaid */}
                {row.bookings.map((booking) => {
                  const pos = getBarPosition(booking)
                  if (!pos) return null

                  return (
                    <div
                      key={booking.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, booking, row.property.id)}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate({
                          to: '/bookings/$bookingId',
                          params: { bookingId: booking.id },
                          search: { from: 'gantt' } as Record<string, string>,
                        })
                      }}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        setTooltip({ booking, x: rect.left + rect.width / 2, y: rect.top })
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      className={`absolute rounded-lg cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow ${getStatusBarStyle(booking.status)}`}
                      style={{
                        left: pos.left,
                        width: pos.width,
                        top: BAR_Y,
                        height: BAR_H,
                        backgroundColor: booking.gantt_color || '#3B82F6',
                        zIndex: 5,
                      }}
                    >
                      <div className="flex items-center h-full px-2 overflow-hidden">
                        {/* Checked-in pulsing dot */}
                        {booking.status === 'checked_in' && (
                          <div className="w-2 h-2 rounded-full bg-white mr-1 shrink-0 animate-pulse" />
                        )}
                        <span className="text-[11px] font-semibold text-white truncate">
                          {booking.guest_name}
                        </span>
                      </div>
                      {/* Cancelled strikethrough */}
                      {booking.status === 'cancelled' && (
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full h-[1px] bg-white/70" />
                        </div>
                      )}
                    </div>
                  )
                })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {sortedRows.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-gray-500">{t('gantt.noProperties')}</p>
        </div>
      )}

      {/* Tooltip */}
      <AnimatePresence>
        {rangePreviewTooltip && pendingPreviewEnd && pendingSelection && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="fixed z-40 rounded-xl border border-emerald-300/30 bg-emerald-950/95 px-3 py-2 text-white shadow-xl pointer-events-none"
            style={{
              left: rangePreviewTooltip.left,
              top: rangePreviewTooltip.top,
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-200/80">
              {t('gantt.stayPreview')}
            </p>
            <p className="mt-0.5 text-xs font-semibold">
              {formatPreviewDate(rangePreviewTooltip.checkIn, shortMonthNames)}
              {' -> '}
              {formatPreviewDate(rangePreviewTooltip.checkOut, shortMonthNames)}
            </p>
            <p className="mt-1 inline-flex rounded-md bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-100">
              {t('gantt.nightCount', { count: rangePreviewTooltip.nights })}
            </p>
          </motion.div>
        )}
        {tooltip && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none fixed z-50 max-w-[280px] rounded-xl border border-white/10 bg-gray-950/95 px-3 py-2.5 text-white shadow-lg backdrop-blur-sm"
            style={{
              left: tooltip.x,
              top: tooltip.y - 8,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="flex items-center gap-2">
              <p className="max-w-[175px] truncate text-sm font-semibold text-white">
                {tooltip.booking.guest_name}
              </p>
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${tooltipStatusTone[tooltip.booking.status]}`}
              >
                {t(tooltipStatusKeys[tooltip.booking.status])}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-gray-300">
              {formatBookingDateRangeShort(tooltip.booking.check_in, tooltip.booking.check_out, shortMonthNames)}
              {' · '}
              {getBookingNights(tooltip.booking.check_in, tooltip.booking.check_out)}N
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-300">
              <span>{formatGuestsCompact(tooltip.booking.adults_count, tooltip.booking.children_count)}</span>
              <span className="text-gray-500">•</span>
              <span>{t(sourceKeys[tooltip.booking.source])}</span>
              <span className="text-gray-500">•</span>
              <span className="font-semibold text-white">
                {formatTooltipPrice(tooltip.booking.total_price, currencySymbol)}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
