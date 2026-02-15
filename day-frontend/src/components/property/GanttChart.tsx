import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from '@tanstack/react-router'
import type { Booking, BookingStatus, GanttPropertySummary } from '../../types/booking'
import type { PricingConfig } from '../../types/property'
import { showToast } from '../ui/Toast'
import { moveBooking } from '../../api/bookings'
import { useQueryClient } from '@tanstack/react-query'

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

const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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

function formatCellPrice(value: number): string {
  if (value >= 10000) return `$${Math.round(value / 1000)}k`
  if (value >= 1000) {
    const short = value / 1000
    return `$${Number.isInteger(short) ? short : short.toFixed(1)}k`
  }
  return `$${Math.round(value)}`
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

function getMonthLabel(date: Date): string {
  return `${shortMonthNames[date.getMonth()]} ${date.getFullYear()}`
}

export default function GanttChart({
  rows,
  year,
  month,
  rangeStart,
  rangeEnd,
  pricingByProperty,
  onCellClick,
}: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)
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
          label: getMonthLabel(firstDate),
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
  }, [days])

  // Tooltip state
  const [tooltip, setTooltip] = useState<{ booking: Booking; x: number; y: number } | null>(null)

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

    if (!dragBooking || dragBooking.sourcePropertyId === targetPropertyId) {
      setDragBooking(null)
      return
    }

    try {
      await moveBooking(dragBooking.booking.id, { target_property_id: targetPropertyId })
      queryClient.invalidateQueries({ queryKey: ['gantt-data'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      showToast('success', 'Booking moved successfully')
    } catch {
      showToast('error', 'Failed to move booking')
    }

    setDragBooking(null)
  }, [dragBooking, queryClient])

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

  function handleCellClick(propertyId: string, day: Date) {
    const dateStr = toDateStr(day)
    if (onCellClick) {
      onCellClick(propertyId, dateStr)
    } else {
      navigate({
        to: '/bookings/new',
        search: { property_id: propertyId, check_in: dateStr } as Record<string, string>,
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
              Property
            </span>
          </div>
          {/* Property name rows */}
          {sortedRows.map((row) => (
            <div
              key={row.property.id}
              className={`flex items-center px-3 border-b border-gray-100 transition-colors ${
                isDragging && dragOverPropertyId === row.property.id
                  ? 'bg-blue-50'
                  : isDragging
                    ? 'bg-gray-50/50'
                    : ''
              }`}
              style={{ height: ROW_H }}
              onDragOver={(e) => handleDragOver(e, row.property.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, row.property.id)}
            >
              <span className="text-sm font-bold text-gray-900 truncate">
                {row.property.internal_name}
              </span>
            </div>
          ))}
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
                    className={`relative shrink-0 overflow-clip border-r border-r-gray-300 ${
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
            {sortedRows.map((row) => (
              <div
                key={row.property.id}
                className={`flex border-b border-gray-100 relative transition-colors ${
                  isDragging && dragOverPropertyId === row.property.id
                    ? 'bg-blue-50/50'
                    : ''
                }`}
                onDragOver={(e) => handleDragOver(e, row.property.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, row.property.id)}
              >
                {/* Day cells */}
                {days.map((day) => {
                  const dayKey = toDateStr(day)
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6
                  const isToday = toDateStr(day) === todayStr
                  const isMonthStart = day.getDate() === 1
                  const hasBooking = isBookedOnDate(row.bookings, day)
                  const nightlyRate = hasBooking
                    ? null
                    : getNightlyRateForDate(pricingByProperty?.[row.property.id], day)
                  return (
                    <div
                      key={dayKey}
                      className={`shrink-0 border-r border-gray-100 cursor-pointer hover:bg-gray-100/50 transition-colors ${
                        isMonthStart ? 'border-l border-l-gray-300' : ''
                      } ${
                        isToday
                          ? 'bg-blue-50 border-l border-l-blue-200'
                          : isWeekend
                            ? 'bg-gray-50'
                            : ''
                      }`}
                      style={{ width: CELL_W, height: ROW_H }}
                      onClick={() => handleCellClick(row.property.id, day)}
                    >
                      {nightlyRate !== null && (
                        <div className="pointer-events-none flex h-full items-end justify-center pb-1">
                          <span className="text-[9px] font-semibold text-emerald-700">
                            {formatCellPrice(nightlyRate)}
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
                        navigate({ to: '/bookings/$bookingId', params: { bookingId: booking.id } })
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
            ))}
          </div>
        </div>
      </div>

      {sortedRows.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-gray-500">No properties to display</p>
        </div>
      )}

      {/* Tooltip */}
      <AnimatePresence>
        {tooltip && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.15 }}
            className="fixed z-50 bg-gray-900 text-white rounded-xl px-3 py-2 shadow-lg pointer-events-none"
            style={{
              left: tooltip.x,
              top: tooltip.y - 8,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <p className="text-xs font-bold">{tooltip.booking.guest_name}</p>
            <p className="text-[10px] text-gray-300 mt-0.5">
              {new Date(tooltip.booking.check_in).toLocaleDateString()} - {new Date(tooltip.booking.check_out).toLocaleDateString()}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-gray-300 capitalize">{tooltip.booking.status.replace('_', ' ')}</span>
              <span className="text-[10px] text-gray-300">${tooltip.booking.total_price.toLocaleString()}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
