import { useMemo, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from '@tanstack/react-router'
import type { Booking, BookingStatus, GanttPropertySummary } from '../../types/booking'
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
  onCellClick?: (propertyId: string, date: string) => void
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

const CELL_W = 40
const NAME_W = 180
const ROW_H = 40
const BAR_H = 28
const BAR_Y = (ROW_H - BAR_H) / 2

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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

export default function GanttChart({ rows, year, month, onCellClick }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const days = useMemo(() => getDaysInMonth(year, month), [year, month])
  const today = new Date()
  const todayStr = toDateStr(today)

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.property.internal_name.localeCompare(b.property.internal_name)),
    [rows],
  )

  // Tooltip state
  const [tooltip, setTooltip] = useState<{ booking: Booking; x: number; y: number } | null>(null)

  // Drag state
  const [dragBooking, setDragBooking] = useState<Booking | null>(null)
  const [dragOverPropertyId, setDragOverPropertyId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleDragStart = useCallback((e: React.DragEvent, booking: Booking) => {
    setDragBooking(booking)
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

    if (!dragBooking || dragBooking.property_id === targetPropertyId) {
      setDragBooking(null)
      return
    }

    try {
      await moveBooking(dragBooking.id, { target_property_id: targetPropertyId })
      queryClient.invalidateQueries({ queryKey: ['gantt-data'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      showToast('success', 'Booking moved successfully')
    } catch {
      showToast('error', 'Failed to move booking')
    }

    setDragBooking(null)
  }, [dragBooking, queryClient])

  function getBarPosition(booking: Booking): { left: number; width: number } | null {
    const checkIn = new Date(booking.check_in)
    const checkOut = new Date(booking.check_out)
    const monthStart = new Date(year, month, 1)
    const monthEnd = new Date(year, month + 1, 0)

    // If booking doesn't overlap this month at all
    if (checkIn > monthEnd || checkOut < monthStart) return null

    const visibleStart = checkIn < monthStart ? monthStart : checkIn
    const visibleEnd = checkOut > monthEnd ? new Date(monthEnd.getTime() + 86400000) : checkOut

    const startDayOffset = Math.floor(
      (visibleStart.getTime() - monthStart.getTime()) / 86400000,
    )
    const endDayOffset = Math.floor(
      (visibleEnd.getTime() - monthStart.getTime()) / 86400000,
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
        <div ref={scrollRef} className="overflow-x-auto flex-1">
          <div style={{ width: days.length * CELL_W }}>
            {/* Date header */}
            <div className="flex border-b border-gray-200" style={{ height: ROW_H }}>
              {days.map((day) => {
                const isWeekend = day.getDay() === 0 || day.getDay() === 6
                const isToday = toDateStr(day) === todayStr
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
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6
                  const isToday = toDateStr(day) === todayStr
                  return (
                    <div
                      key={day.getDate()}
                      className={`shrink-0 border-r border-gray-100 cursor-pointer hover:bg-gray-100/50 transition-colors ${
                        isToday
                          ? 'bg-blue-50 border-l-2 border-l-blue-200'
                          : isWeekend
                            ? 'bg-gray-50'
                            : ''
                      }`}
                      style={{ width: CELL_W, height: ROW_H }}
                      onClick={() => handleCellClick(row.property.id, day)}
                    />
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
                      onDragStart={(e) => handleDragStart(e, booking)}
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
