import { Fragment, useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { motion, Reorder } from 'framer-motion'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArrowUpDown, ChevronDown, ChevronUp, Clock, GripVertical, LogIn, LogOut, Moon, Users } from 'lucide-react'
import type { Booking, BookingStatus, GanttBlock, GanttDayPrice, GanttPropertySummary } from '../../types/booking'
import type { PricingConfig } from '../../types/property'
import { showToast } from '../ui/Toast'
import { moveBooking } from '../../api/bookings'
import { orderProperties } from '../../api/properties'
import { stayRuleBreaches, stayRuleText, type StayRuleBreach } from '../../lib/booking-errors'
import { addDays, barDays, byCompanyOrder, barSpan, barTone, dayNumber, dayOf, hoursOn, nightlyRate, nightsBetween, owes, rowLayout, toReturn, WEEKEND_NIGHTS, type BarTone } from '../../lib/chessboard'
import { formatMoney } from '../../pages/miniapp/format'
import ConfirmDialog from '../ui/ConfirmDialog'
import { Sheet } from '../ui/sheet'
import { useQueryClient } from '@tanstack/react-query'
import { useCurrency } from '../../hooks/useCurrency'
import { useMediaQuery } from '../../hooks/useMediaQuery'

export interface GanttRow {
  property: GanttPropertySummary
  bookings: Booking[]
  /** Nights closed without a booking. */
  blocks?: GanttBlock[]
  /** Nights priced on the calendar. */
  dayPrices?: GanttDayPrice[]
}

/** What a picked range of days does: start a booking, set a price, close the nights. */
export type ChessTool = 'booking' | 'price' | 'close'

/** Picked nights, first and last included, of one flat or of several in a row. */
export interface ChessSelection {
  propertyIds: string[]
  first: string
  last: string
}

interface Props {
  rows: GanttRow[]
  year: number
  month: number
  rangeStart: string
  rangeEnd: string
  todayScrollNonce: number
  pricingByProperty?: Record<string, PricingConfig | null | undefined>
  tool: ChessTool
  /** The range a panel is open for: it stays marked under the panel. */
  selected: ChessSelection | null
  onSelect: (selection: ChessSelection) => void
  onBookingOpen: (booking: Booking) => void
  onBlockOpen: (block: GanttBlock, row: GanttRow) => void
  /** A day of a flat by the hour: its stays and free hours. */
  onHourlyDayOpen: (row: GanttRow, day: string) => void
  /** A booking to move to another flat by the picker: on a touch screen, or with no mouse. */
  moveRequest: Booking | null
  onMoveClose: () => void
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

const CELL_W = 40
const NAME_W = 200
const MONTH_ROW_H = 24
const FREE_ROW_H = 26
const ROW_H = 48
// A bar fills its row but for a rim: as tall as the flat's name beside it.
const BAR_H = 36
const BAR_Y = 6
// Each lane below the first adds this much to the row.
const LANE_STEP = 38
const MONTH_LABEL_W = 92
const MONTH_LABEL_PAD = 6

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Take only the date component so ISO date-time strings (hourly bookings) still
// place correctly on the per-day grid instead of producing an Invalid Date.
function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

// As the server and the booking calendar count them: these hold no night.
const FREES_NIGHTS_STATUSES: BookingStatus[] = ['cancelled', 'completed']

function isBookedOnDate(bookings: Booking[], dayKey: string): boolean {
  return bookings.some((booking) => {
    const { start, end } = barDays(booking.check_in, booking.check_out)
    return start <= dayKey && dayKey < end
  })
}

function formatCellPrice(value: number, sym: string): string {
  if (value >= 10000) return `${sym}${Math.round(value / 1000)}k`
  if (value >= 1000) {
    const short = value / 1000
    return `${sym}${Number.isInteger(short) ? short : short.toFixed(1)}k`
  }
  return `${sym}${Math.round(value)}`
}

// What a bar's colour says, as on Mews' timeline: green the guest is in, indigo they
// are coming, dashed not confirmed yet, grey gone, amber someone is late.
const TONE: Record<BarTone, string> = {
  late: 'bg-warning-soft text-warning ring-1 ring-inset ring-warning/50',
  inHouse: 'bg-success text-white',
  confirmed: 'bg-accent text-white',
  pending: 'bg-accent-soft text-accent-ink border border-dashed border-accent',
  done: 'bg-line text-ink-muted',
  cancelled: 'bg-line/60 text-ink-muted line-through',
}
// A stay's hours on a day's strip, by the same tones as the bars.
const HOUR_TONE: Record<BarTone, string> = {
  late: 'bg-warning',
  inHouse: 'bg-success',
  confirmed: 'bg-accent',
  pending: 'bg-accent/40',
  done: 'bg-ink-muted/40',
  cancelled: 'bg-transparent',
}

// The money badge: a debt of a stay that has begun is red, one still to come amber.
const DEBT_NOW: BarTone[] = ['late', 'inHouse', 'done']

function getMonthLabel(date: Date, monthNames: string[]): string {
  return `${monthNames[date.getMonth()]} ${date.getFullYear()}`
}

function isHourlyBooking(booking: Booking): boolean {
  return booking.rental_mode === 'hourly'
}

// Whole hours (ceil, matching the backend hourly billing) between two datetimes.
function getBookingHours(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn).getTime()
  const end = new Date(checkOut).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.max(0, Math.ceil((end - start) / 3_600_000))
}

// "13–16": an hourly bar is one day wide, its hours say which of the day's it is.
function hourSpan(booking: Booking): string {
  const hour = (value: string) => String(Number(value.slice(11, 13)))
  return `${hour(booking.check_in)}–${hour(booking.check_out)}`
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
    return `${start.getDate()}–${end.getDate()} ${monthNames[start.getMonth()]}`
  }

  const startPart = `${start.getDate()} ${monthNames[start.getMonth()]}`
  const endPart = sameYear
    ? `${end.getDate()} ${monthNames[end.getMonth()]}`
    : `${end.getDate()} ${monthNames[end.getMonth()]} ${end.getFullYear()}`

  return `${startPart} – ${endPart}`
}

// Unified booking-source i18n namespace (shared with GanttAgendaView).
const sourceKeys: Record<Booking['source'], string> = {
  direct: 'bookings.sources.direct',
  booking: 'bookings.sources.booking',
  airbnb: 'bookings.sources.airbnb',
  other: 'bookings.sources.other',
  crm: 'bookings.sources.crm',
  offer: 'bookings.sources.offer',
  site: 'bookings.sources.site',
}

/** A cell of the grid: the flat's row by its place, and the day. */
interface Cell {
  row: number
  day: string
}

export default function GanttChart({
  rows,
  year,
  month,
  rangeStart,
  rangeEnd,
  todayScrollNonce,
  pricingByProperty,
  tool,
  selected,
  onSelect,
  onBookingOpen,
  onBlockOpen,
  onHourlyDayOpen,
  moveRequest,
  onMoveClose,
}: Props) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { symbol: currencySymbol } = useCurrency()
  const isCoarsePointer = useMediaQuery('(hover: none), (pointer: coarse)')
  // A phone keeps more days in sight: narrower days, a shorter names column.
  const isMobile = useMediaQuery('(max-width: 640px)')
  const cellW = isMobile ? 34 : CELL_W
  const baseNameW = isMobile ? 104 : NAME_W
  const scrollRef = useRef<HTMLDivElement>(null)

  const weekdayNames = useMemo(() => Array.from({ length: 7 }, (_, i) => t(`gantt.weekdays.${i}`)), [t])
  const shortMonthNames = useMemo(() => Array.from({ length: 12 }, (_, i) => t(`gantt.monthsShort.${i}`)), [t])
  // A month inside a date is written small, "9 ноя", but for English, "9 Nov".
  const dateMonthNames = useMemo(
    () => (i18n.language === 'en' ? shortMonthNames : shortMonthNames.map((name) => name.toLowerCase())),
    [i18n.language, shortMonthNames],
  )
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
  const pad = (n: number) => String(n).padStart(2, '0')
  // Local time as the bookings carry it, to tell who is late.
  const nowKey = `${todayStr}T${pad(today.getHours())}:${pad(today.getMinutes())}:00`

  // The rows in the company's order, those it did not place after, by name. While the
  // order is being changed, as it stands on the screen.
  const [ordering, setOrdering] = useState<string[] | null>(null)
  const [orderSaving, setOrderSaving] = useState(false)
  // A flat being moved must be named in full: the handles take a phone's narrow column.
  const nameW = ordering !== null && isMobile ? 184 : baseNameW
  const sortedRows = useMemo(() => {
    if (ordering) return ordering.map((id) => rows.find((row) => row.property.id === id)).filter((row): row is GanttRow => row !== undefined)
    return byCompanyOrder(rows)
  }, [rows, ordering])

  function moveRow(id: string, by: -1 | 1) {
    setOrdering((order) => {
      if (!order) return order
      const from = order.indexOf(id)
      const to = from + by
      if (to < 0 || to >= order.length) return order
      const next = [...order]
      ;[next[from], next[to]] = [next[to], next[from]]
      return next
    })
  }

  async function saveOrder(ids: string[]) {
    setOrderSaving(true)
    try {
      // The order by name is no order of the company's: saved as none, a new flat
      // then takes its place by name too.
      const byName = [...rows].sort((a, b) => a.property.internal_name.localeCompare(b.property.internal_name)).map((row) => row.property.id)
      await orderProperties(ids.join() === byName.join() ? [] : ids)
      await queryClient.invalidateQueries({ queryKey: ['gantt-data'] })
      setOrdering(null)
    } catch {
      showToast('error', t('gantt.orderFailed'))
    } finally {
      setOrderSaving(false)
    }
  }
  const lanesByRow = useMemo(
    () => new Map(sortedRows.map((row) => [row.property.id, rowLayout(row.bookings)])),
    [sortedRows],
  )
  const closedByRow = useMemo(
    () => new Map(sortedRows.map((row) => [
      row.property.id,
      new Set((row.blocks ?? []).flatMap((block) => nightsBetween(block.start_date, toDateStr(new Date(parseDateOnly(block.end_date).getTime() - 86400000))))),
    ])),
    [sortedRows],
  )
  // How many flats sold by the night are free on each night from today on.
  const freeByDay = useMemo(() => {
    const sellable = sortedRows.filter((row) => row.property.status !== 'paused' && row.property.rental_mode !== 'hourly')
    return new Map(days.map((day) => {
      const key = toDateStr(day)
      const free = sellable.filter((row) =>
        !isBookedOnDate(row.bookings.filter((booking) => !FREES_NIGHTS_STATUSES.includes(booking.status)), key)
        && !closedByRow.get(row.property.id)?.has(key),
      ).length
      return [key, free]
    }))
  }, [closedByRow, days, sortedRows])
  const rowHeight = (row: GanttRow) => ROW_H + ((lanesByRow.get(row.property.id)?.count ?? 1) - 1) * LANE_STEP
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
  // One booking, or a day's: the hours of a day, or a night with the hours of its morning.
  const [tooltip, setTooltip] = useState<{ bookings: Booking[]; x: number; y: number } | null>(null)
  // Leaving one bar for the next, the tip changes in place: no blank between them.
  const hideTipTimer = useRef<number | undefined>(undefined)
  const showTip = (next: { bookings: Booking[]; x: number; y: number }) => {
    window.clearTimeout(hideTipTimer.current)
    setTooltip(next)
  }
  const hideTip = () => {
    window.clearTimeout(hideTipTimer.current)
    hideTipTimer.current = window.setTimeout(() => setTooltip(null), 80)
  }

  // Picking days: pressed and drawn across the cells, or one click and then another.
  const [drag, setDrag] = useState<{ from: Cell; to: Cell } | null>(null)
  const [pending, setPending] = useState<Cell | null>(null)
  const [hover, setHover] = useState<Cell | null>(null)

  // Drag state
  const [dragBooking, setDragBooking] = useState<{
    booking: Booking
    sourcePropertyId: string
  } | null>(null)
  const [dragOverPropertyId, setDragOverPropertyId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // A move the target flat's stay rules refused, waiting for the operator's word.
  const [ruleMove, setRuleMove] = useState<{ bookingId: string; targetPropertyId: string; breaches: StayRuleBreach[] } | null>(null)

  // Horizontal-scroll affordance: edge fades that appear when the track can scroll.
  const [scrollShadow, setScrollShadow] = useState<{ start: boolean; end: boolean }>({
    start: false,
    end: true,
  })

  // The first day in sight, in whole cells: a bar begun before it keeps its guest's
  // name at the edge. Whole cells, so a scroll redraws the grid only as a day passes.
  const [firstCellInSight, setFirstCellInSight] = useState(0)

  const updateScrollShadow = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const start = el.scrollLeft > 1
    const end = el.scrollLeft < el.scrollWidth - el.clientWidth - 1
    setScrollShadow((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
    setFirstCellInSight(Math.ceil(el.scrollLeft / cellW))
  }, [cellW])

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const scrollKey = `${year}-${month}-${rangeStart}-${rangeEnd}-${todayScrollNonce}`
    if (autoScrollKeyRef.current === scrollKey) return

    const targetDate = year === todayYear && month === todayMonth
      ? todayStr
      : toDateStr(new Date(year, month, 1))
    const targetIndex = days.findIndex((day) => toDateStr(day) === targetDate)
    if (targetIndex < 0) return

    // Two days before today stay in sight: the stays that end today show whole.
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)
    const target = Math.min(Math.max(0, targetIndex - 2) * cellW, maxScrollLeft)
    container.scrollLeft = target
    autoScrollKeyRef.current = scrollKey
    updateScrollShadow()
  }, [cellW, days, month, rangeEnd, rangeStart, todayMonth, todayScrollNonce, todayStr, todayYear, updateScrollShadow, year])

  // Another tool starts its own pick.
  const [pickTool, setPickTool] = useState(tool)
  if (pickTool !== tool) {
    setPickTool(tool)
    setPending(null)
    setDrag(null)
  }

  // The range between two cells; a booking is one flat's, so it keeps the first cell's row.
  const span = useCallback((a: Cell, b: Cell): ChessSelection => {
    const [top, bottom] = tool === 'booking' ? [a.row, a.row] : [Math.min(a.row, b.row), Math.max(a.row, b.row)]
    return {
      propertyIds: sortedRows.slice(top, bottom + 1).map((row) => row.property.id),
      first: a.day < b.day ? a.day : b.day,
      last: a.day < b.day ? b.day : a.day,
    }
  }, [sortedRows, tool])

  // A click: the first one marks a night, the second one the other end.
  const clickCell = useCallback((cell: Cell) => {
    // An hourly flat sells hours of one day: its day is picked at once.
    if (tool === 'booking' && sortedRows[cell.row]?.property.rental_mode === 'hourly') {
      setPending(null)
      onSelect(span(cell, cell))
    } else if (pending) {
      setPending(null)
      setHover(null)
      onSelect(span(pending, cell))
    } else {
      setPending(cell)
    }
  }, [onSelect, pending, sortedRows, span, setHover, setPending, tool])

  useEffect(() => {
    if (!drag) return
    const finish = () => {
      setDrag(null)
      if (drag.from.row === drag.to.row && drag.from.day === drag.to.day) clickCell(drag.from)
      else {
        setPending(null)
        onSelect(span(drag.from, drag.to))
      }
    }
    const cancel = () => setDrag(null)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [clickCell, drag, onSelect, span])

  useEffect(() => {
    if (!pending) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPending(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending])

  // What is marked now: the range being drawn, the first click and the hovered cell,
  // or the range the panel is open for.
  const marked: ChessSelection | null = drag
    ? span(drag.from, drag.to)
    : pending
      ? span(pending, hover ?? pending)
      : selected
  const markedRows = new Set(marked?.propertyIds ?? [])

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

  // One move, by drag or by the picker. The target flat's stay rules may refuse
  // it; the operator then confirms and the same move goes again with override_rules.
  const runMove = useCallback(async (bookingId: string, targetPropertyId: string, overrideRules = false) => {
    try {
      await moveBooking(bookingId, { target_property_id: targetPropertyId, override_rules: overrideRules || undefined })
      queryClient.invalidateQueries({ queryKey: ['gantt-data'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      // The booking's panel reads its flat: an extension is then priced by the new one.
      queryClient.invalidateQueries({ queryKey: ['booking', bookingId] })
      queryClient.invalidateQueries({ queryKey: ['extend-quote', bookingId] })
      showToast('success', t('gantt.bookingMoved'))
    } catch (error) {
      const breaches = stayRuleBreaches(error)
      if (breaches) setRuleMove({ bookingId, targetPropertyId, breaches })
      else showToast('error', t('gantt.failedMoveBooking'))
    }
  }, [queryClient, setRuleMove, t])

  // Why a booking cannot go to a flat, said before it is tried: paused, not let this
  // way, or its nights or hours taken. Null: it can.
  const moveRefusal = useCallback((booking: Booking, row: GanttRow): string | null => {
    if (row.property.status === 'paused') return t('common.paused')
    const hourly = isHourlyBooking(booking)
    const mode = row.property.rental_mode ?? 'daily'
    if (hourly ? mode === 'daily' : mode === 'hourly') return t(hourly ? 'gantt.moveNoHours' : 'gantt.moveNoNights')
    const taken = row.bookings.some(
      (other) => other.id !== booking.id && !FREES_NIGHTS_STATUSES.includes(other.status)
        && other.check_in < booking.check_out && booking.check_in < other.check_out,
    )
    return taken ? t('gantt.cellTaken') : null
  }, [t])

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
    const target = rows.find((row) => row.property.id === targetPropertyId)
    const refusal = target ? moveRefusal(dragBooking.booking, target) : null
    if (target && refusal) {
      showToast('error', `${target.property.internal_name}: ${refusal}`)
      setDragBooking(null)
      return
    }

    await runMove(dragBooking.booking.id, targetPropertyId)
    setDragBooking(null)
  }, [dragBooking, moveRefusal, propertyStatusById, rows, runMove, t])

  // Move by the picker: same semantics as drag-and-drop, for a finger or no mouse.
  const handleMoveBookingTo = useCallback(async (
    booking: Booking,
    targetPropertyId: string,
  ) => {
    if (propertyStatusById[targetPropertyId] === 'paused') {
      showToast('error', t('gantt.cannotMoveToPaused'))
      return
    }
    if (booking.property_id !== targetPropertyId) await runMove(booking.id, targetPropertyId)
    onMoveClose()
  }, [onMoveClose, propertyStatusById, runMove, t])

  const origin = dayNumber(rangeStart)
  // [start, end) on the x axis in days, clipped to the visible range.
  // A bar's start: past the hours inside it, and past the left edge of the view when
  // it began before it, with room left for the name.
  function barPadding(pos: { left: number; width: number }, hoursInside: boolean, narrow: boolean): number | undefined {
    if (narrow) return undefined
    const pad = 8
    const hidden = firstCellInSight * cellW - pos.left
    const start = Math.max(hoursInside ? cellW : pad, hidden > 0 ? hidden + pad : 0)
    return start === pad ? undefined : Math.min(start, Math.max(pad, pos.width - 72))
  }

  // A debt on a cell too small to hold it: the money badge sits on the cell's corner,
  // over its rim, as the legend shows it; red once the stay has begun.
  function debtBadge(key: string, right: number, top: number, now: boolean) {
    return (
      <span
        key={key}
        aria-hidden="true"
        className={`pointer-events-none absolute flex h-3 w-3 items-center justify-center rounded-full text-[7px] font-bold ring-2 ring-surface-card ${now ? 'bg-danger text-white' : 'bg-warning-soft text-warning'}`}
        style={{ left: right - 6, top: top - 6, zIndex: 8 }}
      >
        {currencySymbol}
      </span>
    )
  }

  function place(start: number, end: number): { left: number; width: number } | null {
    const from = Math.max(start - origin, 0)
    const to = Math.min(end - origin, days.length)
    if (to <= 0 || from >= days.length) return null
    return { left: from * cellW, width: Math.max(to - from, 0.5) * cellW }
  }
  const getSpanPosition = (start: string, end: string) => place(dayNumber(start), dayNumber(end))
  const nowX = (dayNumber(todayStr) + (today.getHours() + today.getMinutes() / 60) / 24 - origin) * cellW

  // A flat's prices under its name, each by its mark: the night, and the shortest stay
  // by the hour; every tariff in the tip.
  function flatPrices(row: GanttRow) {
    const pricing = pricingByProperty?.[row.property.id]
    if (!pricing) return null
    const money = (value: number) => `${formatMoney(value, i18n.language)} ${currencySymbol}`
    const night = row.property.rental_mode !== 'hourly' && pricing.base_price > 0 ? pricing.base_price : null
    const hours = row.property.rental_mode !== 'daily'
    const tariffs = hours
      ? [
          pricing.price_3h > 0 && t('gantt.flat3h', { price: money(pricing.price_3h) }),
          pricing.price_6h > 0 && t('gantt.flat6h', { price: money(pricing.price_6h) }),
          pricing.price_night > 0 && t('gantt.flatNightTariff', { price: money(pricing.price_night) }),
        ].filter((tariff): tariff is string => Boolean(tariff))
      : []
    if (night === null && tariffs.length === 0) return null
    return (
      <p className="flex min-w-0 items-center gap-2 text-[11px] text-ink-muted tabular-nums" title={tariffs.join('\n') || undefined}>
        {night !== null && (
          <span className="flex shrink-0 items-center gap-0.5">
            <Moon className="h-3 w-3" aria-label={t('properties.form.rentalModeDaily')} />
            {money(night)}
          </span>
        )}
        {tariffs.length > 0 && (
          <span className="flex min-w-0 items-center gap-0.5">
            <Clock className="h-3 w-3 shrink-0" aria-label={t('properties.form.rentalModeHourly')} />
            <span className="truncate">{tariffs[0]}</span>
          </span>
        )}
      </p>
    )
  }

  const markedNights = marked ? nightsBetween(marked.first, marked.last).length : 0
  const markedFlats = sortedRows.filter((row) => markedRows.has(row.property.id)).map((row) => row.property.internal_name)
  const pickCursor = tool === 'booking' ? 'cursor-pointer' : 'cursor-crosshair'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="relative overflow-hidden rounded-2xl border border-line bg-surface-card"
    >
      {/* What is being picked, in words: the flats, the nights, how many. */}
      {/* As tall with the Cancel button as without it: the grid must not jump on a click. */}
      <div className="flex min-h-[48px] flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-4 py-2 text-xs" aria-live="polite">
        {ordering !== null ? (
          <>
            <span className="font-semibold text-ink">{t('gantt.orderHint')}</span>
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={orderSaving}
                // Only on the screen: Save keeps it, Cancel brings the old order back.
                onClick={() => setOrdering([...rows].sort((a, b) => a.property.internal_name.localeCompare(b.property.internal_name)).map((row) => row.property.id))}
                className="min-h-[28px] rounded-lg px-2.5 font-semibold text-accent-ink hover:underline disabled:opacity-50"
              >
                {t('gantt.orderByName')}
              </button>
              <button
                type="button"
                disabled={orderSaving}
                onClick={() => setOrdering(null)}
                className="min-h-[28px] rounded-lg border border-line px-2.5 font-semibold text-ink hover:bg-surface-page disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={orderSaving}
                onClick={() => void saveOrder(ordering)}
                className="min-h-[28px] rounded-lg bg-accent px-2.5 font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {t('common.save')}
              </button>
            </span>
          </>
        ) : marked && (drag || pending) ? (
          <>
            <span className="whitespace-nowrap font-bold text-ink">{markedFlats.length > 2 ? t('gantt.flatsCount', { count: markedFlats.length }) : markedFlats.join(', ')}</span>
            <span className="text-ink-muted">·</span>
            <span className="whitespace-nowrap font-semibold text-ink">
              {marked.first === marked.last
                ? `${parseDateOnly(marked.first).getDate()} ${dateMonthNames[parseDateOnly(marked.first).getMonth()]}`
                : formatBookingDateRangeShort(marked.first, marked.last, dateMonthNames)}
            </span>
            <span className="text-ink-muted">·</span>
            <span className="whitespace-nowrap text-ink-muted">{t('gantt.nightCount', { count: markedNights })}</span>
            {pending && !drag && (
              <span className="ml-auto flex items-center gap-3">
                <span className="text-ink-muted">{t('gantt.pickSecond')}</span>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  className="min-h-[28px] rounded-lg border border-line px-2.5 font-semibold text-ink hover:bg-surface-page"
                >
                  {t('common.cancel')}
                </button>
              </span>
            )}
          </>
        ) : (
          <span className="text-ink-muted">{t(`gantt.${isCoarsePointer ? 'toolHintTouch' : 'toolHint'}.${tool}`)}</span>
        )}
      </div>
      <div className="flex select-none">
        {/* Fixed property names column */}
        <div className="z-10 shrink-0 border-r border-line bg-surface-card" style={{ width: nameW }}>
          <div className="border-b border-line bg-surface-page" style={{ height: MONTH_ROW_H }} />
          <div className="flex items-center border-b border-line px-4" style={{ height: ROW_H }}>
            <span className="text-xs font-semibold text-ink-muted">{t('gantt.property')}</span>
            {ordering === null && sortedRows.length > 1 && (
              <button
                type="button"
                onClick={() => setOrdering(sortedRows.map((row) => row.property.id))}
                aria-label={t('gantt.orderChange')}
                title={t('gantt.orderChange')}
                className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-page hover:text-ink"
              >
                <ArrowUpDown className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center border-b border-line bg-surface-page px-4" style={{ height: FREE_ROW_H }}>
            <span className="text-[11px] font-semibold text-ink-muted">{t('gantt.freeRow')}</span>
          </div>
          {ordering !== null ? (
            // Changing the order: a flat's row is dragged by mouse or finger, and the
            // grid's rows follow as it goes; the arrows stay for the keyboard.
            <Reorder.Group as="div" axis="y" values={ordering} onReorder={setOrdering}>
              {sortedRows.map((row, index) => (
                <Reorder.Item
                  key={row.property.id}
                  as="div"
                  value={row.property.id}
                  className="flex cursor-grab items-center gap-1 border-b border-line bg-surface-card pr-4 active:cursor-grabbing"
                  style={{ height: rowHeight(row), touchAction: 'none' }}
                  whileDrag={{ scale: 1.02, boxShadow: '0 8px 20px rgba(0,0,0,0.12)', zIndex: 20 }}
                >
                  <GripVertical className="ml-1 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                  <span className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      disabled={index === 0}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => moveRow(row.property.id, -1)}
                      aria-label={t('gantt.orderUp', { flat: row.property.internal_name })}
                      className="flex h-6 w-7 items-center justify-center rounded text-ink-muted hover:bg-surface-page hover:text-ink disabled:opacity-25"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === sortedRows.length - 1}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => moveRow(row.property.id, 1)}
                      aria-label={t('gantt.orderDown', { flat: row.property.internal_name })}
                      className="flex h-6 w-7 items-center justify-center rounded text-ink-muted hover:bg-surface-page hover:text-ink disabled:opacity-25"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </span>
                  <span className="truncate text-sm font-bold text-ink select-none">{row.property.internal_name}</span>
                </Reorder.Item>
              ))}
            </Reorder.Group>
          ) : (
            sortedRows.map((row) => {
              const isPaused = row.property.status === 'paused'
              const prices = flatPrices(row)
              return (
                <div
                  key={row.property.id}
                  className={`flex flex-col justify-center border-b border-line px-4 transition-colors ${
                    isPaused ? 'bg-warning-soft/60' : ''
                  } ${!isPaused && isDragging && dragOverPropertyId === row.property.id ? 'bg-accent-soft' : ''}`}
                  style={{ height: rowHeight(row) }}
                  onDragOver={(e) => {
                    if (!isPaused) handleDragOver(e, row.property.id)
                  }}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => {
                    if (!isPaused) handleDrop(e, row.property.id)
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Link
                      to="/properties/$propertyId"
                      params={{ propertyId: row.property.id }}
                      className="truncate text-sm font-bold text-ink hover:text-accent-ink hover:underline"
                    >
                      {row.property.internal_name}
                    </Link>
                    {isPaused && (
                      <span className="shrink-0 rounded-md bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                        {t('common.paused')}
                      </span>
                    )}
                  </div>
                  {!isMobile && prices}
                </div>
              )
            })
          )}
        </div>

        {/* Scrollable dates area */}
        <div className="relative min-w-0 flex-1">
          <div ref={scrollRef} className="overflow-x-auto" onScroll={updateScrollShadow}>
          <div className="relative" style={{ width: days.length * cellW }}>
            <div className="relative border-b border-line bg-surface-page" style={{ height: MONTH_ROW_H }}>
              <div className="flex h-full">
                {monthSegments.map((segment, idx) => (
                  <div
                    key={segment.key}
                    className={`relative box-border shrink-0 overflow-clip ${idx > 0 ? 'border-l border-l-line' : ''}`}
                    style={{ width: segment.daysCount * cellW }}
                  >
                    <div
                      className="pointer-events-none sticky z-10 flex h-full items-center"
                      style={{ left: MONTH_LABEL_PAD, width: MONTH_LABEL_W }}
                    >
                      <span className="block truncate text-[11px] font-bold text-ink">{segment.label}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Date header */}
            <div className="flex border-b border-line" style={{ height: ROW_H }}>
              {days.map((day) => {
                const dayKey = toDateStr(day)
                const isWeekend = WEEKEND_NIGHTS.includes(day.getDay())
                const isToday = dayKey === todayStr
                const isMonthStart = day.getDate() === 1
                return (
                  <div
                    key={dayKey}
                    className={`flex shrink-0 flex-col items-center justify-center border-r border-line/60 ${
                      isMonthStart ? 'border-l border-l-line' : ''
                    } ${isToday ? 'bg-accent-soft' : isWeekend ? 'bg-surface-page' : ''}`}
                    style={{ width: cellW }}
                  >
                    <span className={`text-[11px] leading-none ${isToday ? 'text-accent-ink' : 'text-ink-muted'}`}>
                      {weekdayNames[day.getDay()]}
                    </span>
                    <span className={`text-xs font-bold ${isToday ? 'rounded-md bg-accent px-1.5 text-white' : 'text-ink'}`}>{day.getDate()}</span>
                  </div>
                )
              })}
            </div>

            {/* Free flats on each night from today on: where there is still something to sell */}
            <div className="flex border-b border-line bg-surface-page" style={{ height: FREE_ROW_H }}>
              {days.map((day) => {
                const key = toDateStr(day)
                const free = freeByDay.get(key) ?? 0
                return (
                  <div
                    key={key}
                    className={`flex shrink-0 items-center justify-center border-r border-line/60 text-[11px] tabular-nums ${
                      key < todayStr ? 'text-ink-muted/40' : free === 0 ? 'bg-danger-soft font-bold text-danger' : 'font-semibold text-ink-muted'
                    }`}
                    style={{ width: cellW }}
                  >
                    {key < todayStr ? '' : free}
                  </div>
                )
              })}
            </div>

            {/* Now: a line through the grid at this hour */}
            {nowX > 0 && nowX < days.length * cellW && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 w-0.5 bg-accent"
                style={{ left: nowX - 1, top: MONTH_ROW_H + ROW_H, zIndex: 3 }}
              />
            )}

            {/* Grid rows with booking bars */}
            {sortedRows.map((row, rowIndex) => {
              const isPaused = row.property.status === 'paused'
              const priced = new Map((row.dayPrices ?? []).map((night) => [night.date, night.price]))
              const closedNights = closedByRow.get(row.property.id) ?? new Set<string>()
              const lanes = lanesByRow.get(row.property.id)
              const rowMarked = markedRows.has(row.property.id)
              return (
                <div
                  key={row.property.id}
                  className={`relative flex border-b border-line transition-colors ${isPaused ? 'bg-warning-soft/30' : ''} ${
                    !isPaused && isDragging && dragOverPropertyId === row.property.id ? 'bg-accent-soft/60' : ''
                  }`}
                  style={{ height: rowHeight(row) }}
                  onDragOver={(e) => {
                    if (!isPaused) handleDragOver(e, row.property.id)
                  }}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => {
                    if (!isPaused) handleDrop(e, row.property.id)
                  }}
                >
                {/* Day cells */}
                {days.map((day) => {
                  const dayKey = toDateStr(day)
                  const isWeekend = WEEKEND_NIGHTS.includes(day.getDay())
                  const isToday = dayKey === todayStr
                  const isMonthStart = day.getDate() === 1
                  const isMarked = rowMarked && marked !== null && marked.first <= dayKey && dayKey <= marked.last
                  const hasBooking = isBookedOnDate(row.bookings, dayKey)
                  const closed = closedNights.has(dayKey)
                  const custom = priced.get(dayKey)
                  const rate = hasBooking || closed || row.property.rental_mode === 'hourly'
                    ? null
                    : nightlyRate(pricingByProperty?.[row.property.id], dayKey, custom)
                  const cell = { row: rowIndex, day: dayKey }
                  // A booking is not made on a paused flat; its prices and nights can still change.
                  const refused = isPaused && tool === 'booking'
                  return (
                    <button
                      key={dayKey}
                      type="button"
                      aria-label={`${row.property.internal_name}, ${weekdayNames[day.getDay()]} ${day.getDate()} ${dateMonthNames[day.getMonth()]}`}
                      // The night as it stands: free at its price, taken or closed.
                      aria-description={
                        closed
                          ? t('gantt.closed')
                          : hasBooking
                            ? t('gantt.cellTaken')
                            : rate !== null
                              ? t('gantt.cellFree', { price: `${formatMoney(rate, i18n.language)} ${currencySymbol}` })
                              : undefined
                      }
                      aria-pressed={isMarked}
                      className={`relative shrink-0 border-r border-line/60 transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                        refused ? 'cursor-not-allowed' : `${pickCursor} hover:bg-accent-soft/60`
                      } ${isMonthStart ? 'border-l border-l-line' : ''} ${
                        isMarked ? 'bg-accent/15 ring-1 ring-inset ring-accent/40' : isToday ? 'bg-accent-soft/40' : isWeekend ? 'bg-surface-page' : ''
                      }`}
                      style={{ width: cellW, height: '100%' }}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return
                        if (refused) {
                          showToast('error', t('gantt.pausedUnavailable'))
                          return
                        }
                        setDrag({ from: cell, to: cell })
                      }}
                      onPointerEnter={() => {
                        if (drag) {
                          setDrag((prev) => (prev ? { ...prev, to: cell } : prev))
                        } else if (pending) {
                          setHover(cell)
                        }
                      }}
                      onClick={(e) => {
                        // A pointer's click is handled on its release; Enter and Space come here.
                        if (e.detail === 0 && !refused) clickCell(cell)
                      }}
                    >
                      {rate !== null && (
                        <div className="pointer-events-none flex h-full items-center justify-center">
                          <span
                            className={`text-[10px] font-semibold ${
                              isPaused ? 'text-ink-muted' : custom !== undefined ? 'text-violet-700' : 'text-success'
                            }`}
                          >
                            {formatCellPrice(rate, currencySymbol)}
                          </span>
                        </div>
                      )}
                    </button>
                  )
                })}

                {/* Closed nights: hatched, under the booking bars; open from the panel */}
                {(row.blocks ?? []).map((block) => {
                  const pos = getSpanPosition(block.start_date, block.end_date)
                  if (!pos) return null
                  const label = block.reason || t('gantt.closed')
                  return (
                    <button
                      key={block.id}
                      type="button"
                      aria-label={`${t('gantt.closed')}: ${label}`}
                      title={label}
                      onClick={() => onBlockOpen(block, row)}
                      className="absolute rounded-lg text-left text-[11px] font-semibold text-ink-muted hover:ring-2 hover:ring-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      style={{
                        left: pos.left + 1,
                        width: pos.width - 2,
                        top: BAR_Y,
                        height: BAR_H,
                        zIndex: 4,
                        background: 'repeating-linear-gradient(45deg, #e2e2e8 0 6px, #f2f3f7 6px 12px)',
                        // Another tool picks the nights under it.
                        pointerEvents: tool === 'booking' ? undefined : 'none',
                      }}
                    >
                      <span className="flex h-full items-center overflow-hidden whitespace-nowrap px-2">{label}</span>
                    </button>
                  )
                })}

                {/* A platform's booking over a Day booking (the server tells which): the
                    nights sold twice, in red over the booking, until one is cancelled. */}
                {(row.blocks ?? []).filter((block) => block.clash).flatMap((block) =>
                  row.bookings
                    .filter((booking) => !FREES_NIGHTS_STATUSES.includes(booking.status))
                    .map((booking) => {
                      const stay = barDays(booking.check_in, booking.check_out)
                      const from = stay.start > block.start_date ? stay.start : block.start_date
                      const to = stay.end < block.end_date ? stay.end : block.end_date
                      if (from >= to) return null
                      const pos = getSpanPosition(from, to)
                      if (!pos) return null
                      const label = `${t('gantt.doubleSale')} · ${block.reason || t('gantt.closed')}`
                      return (
                        <div
                          key={`${block.id}:${booking.id}`}
                          role="img"
                          aria-label={`${t('gantt.doubleSale')}: ${block.reason || t('gantt.closed')}`}
                          title={label}
                          className="pointer-events-none absolute rounded-lg text-[11px] font-semibold text-red-800 outline outline-2 outline-red-600"
                          style={{
                            left: pos.left,
                            width: pos.width,
                            top: BAR_Y + (lanes?.lane.get(booking.id) ?? lanes?.lane.get(`h:${dayOf(booking.check_in)}`) ?? 0) * LANE_STEP,
                            height: BAR_H,
                            zIndex: 7,
                            background: 'repeating-linear-gradient(45deg, rgba(254,202,202,0.85) 0 6px, rgba(254,226,226,0.6) 6px 12px)',
                          }}
                        >
                          <div className="flex h-full items-center overflow-hidden whitespace-nowrap px-2">{label}</div>
                        </div>
                      )
                    }),
                )}

                {/* A day by the hour: one strip, the day's 24 hours with the stays on it */}
                {(lanes?.days ?? []).map((day) => {
                  // A day's cell, [day, day + 1): on the first day shown an empty span is dropped.
                  const pos = getSpanPosition(day, addDays(day, 1))
                  if (!pos) return null
                  const parts = hoursOn(row.bookings, day)
                  const owing = parts.filter((part) => owes(part.stay) > 0)
                  const inBar = [...(lanes?.inside.values() ?? [])].includes(day)
                  const stripLeft = pos.left + (inBar ? 3 : 1)
                  const stripTop = BAR_Y + (lanes?.lane.get(`h:${day}`) ?? 0) * LANE_STEP + (inBar ? 2 : 0)
                  // Hours a platform sold again: said first, and outlined red as on a bar.
                  const overbooked = parts.some((part) => part.stay.overbooking)
                  const dayDate = parseDateOnly(day)
                  return (
                    <Fragment key={`h:${day}`}>
                    <button
                      type="button"
                      aria-label={`${overbooked ? `${t('bookings.overbooking.short')}: ` : ''}${row.property.internal_name}, ${dayDate.getDate()} ${dateMonthNames[dayDate.getMonth()]}, ${t('gantt.hourlyDay', { count: parts.length })}: ${parts.map((part) => `${hourSpan(part.stay)} ${part.stay.guest_name}`).join(', ')}`}
                      // One stay in the cell moves by drag as a bar does; of several, the one to
                      // move is picked in the day's panel ("Move to…").
                      draggable={parts.length === 1}
                      onDragStart={(e) => {
                        if (parts.length !== 1) return
                        setTooltip(null)
                        handleDragStart(e, parts[0].stay, row.property.id)
                      }}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => {
                        e.stopPropagation()
                        setTooltip(null)
                        onHourlyDayOpen(row, day)
                      }}
                      onMouseEnter={(e) => {
                        if (isCoarsePointer) return
                        const rect = e.currentTarget.getBoundingClientRect()
                        showTip({ bookings: parts.map((part) => part.stay), x: rect.left + rect.width / 2, y: rect.top })
                      }}
                      onMouseLeave={() => {
                        if (isCoarsePointer) return
                        hideTip()
                      }}
                      className={`absolute flex cursor-pointer flex-col justify-between overflow-hidden rounded-lg bg-surface-card px-0.5 pb-0.5 pt-px shadow-sm ring-1 ring-inset ring-line transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                        overbooked ? 'outline outline-2 outline-offset-1 outline-red-600' : ''
                      }`}
                      style={{
                        // Inside a stay's bar it keeps a rim of the bar around it.
                        left: stripLeft,
                        width: cellW - (inBar ? 6 : 2),
                        top: stripTop,
                        height: BAR_H - (inBar ? 4 : 0),
                        zIndex: inBar ? 6 : 5,
                        pointerEvents: tool === 'booking' ? undefined : 'none',
                      }}
                    >
                      <span className={`flex items-center justify-center gap-0.5 whitespace-nowrap font-bold tracking-tight text-ink tabular-nums ${inBar ? 'text-[9px] leading-[11px]' : 'text-[10px] leading-[14px]'}`}>
                        {parts.length === 1 ? hourSpan(parts[0].stay) : (
                          <>
                            <Clock className="h-2.5 w-2.5 text-ink-muted" aria-hidden="true" />
                            {parts.length}
                          </>
                        )}
                      </span>
                      <span aria-hidden="true" className="relative block h-2 w-full overflow-hidden rounded-full bg-success-soft ring-1 ring-inset ring-success/30">
                        {parts.map((part) => (
                          <span
                            key={part.stay.id}
                            className={`absolute inset-y-0 ${HOUR_TONE[barTone(part.stay, nowKey)]}`}
                            style={{ left: `${(part.from / 1440) * 100}%`, width: `${((part.to - part.from) / 1440) * 100}%` }}
                          />
                        ))}
                      </span>
                    </button>
                    {owing.length > 0 && debtBadge(
                      `debt:h:${day}`,
                      stripLeft + cellW - (inBar ? 6 : 2),
                      stripTop,
                      owing.some((part) => DEBT_NOW.includes(barTone(part.stay, nowKey))),
                    )}
                    </Fragment>
                  )
                })}

                {/* Booking bars by the night, each on its lane */}
                {row.bookings.filter((booking) => !isHourlyBooking(booking)).map((booking) => {
                  const stay = barSpan(booking)
                  const pos = place(stay.start, stay.end)
                  if (!pos) return null
                  const hourly = isHourlyBooking(booking)
                  // A bar of one night: no room for a name beside an icon and a badge.
                  const narrow = !hourly && pos.width < cellW * 1.5
                  const clocked = lanes?.clocks.has(booking.id) ?? false
                  const lane = lanes?.lane.get(booking.id) ?? 0
                  const tone = barTone(booking, nowKey)
                  const debt = owes(booking)
                  const arrivesToday = (booking.status === 'confirmed' || booking.status === 'pending') && booking.check_in.slice(0, 10) === todayStr
                  const leavesToday = booking.status === 'checked_in' && booking.check_out.slice(0, 10) === todayStr
                  const debtTone = DEBT_NOW.includes(tone) ? 'bg-danger text-white' : 'bg-white text-warning ring-1 ring-warning/50'
                  // One cell holds the night and the hours of its morning: the badge owns both debts.
                  const morningAll = clocked ? hoursOn(row.bookings, dayOf(booking.check_in)) : []
                  const morningCount = morningAll.length
                  const morning = morningAll.filter((part) => owes(part.stay) > 0)
                  const cellDebt = debt > 0 || morning.length > 0
                  const cellDebtNow = (debt > 0 && DEBT_NOW.includes(tone)) || morning.some((part) => DEBT_NOW.includes(barTone(part.stay, nowKey)))

                  return (
                    <Fragment key={booking.id}>
                    <button
                      type="button"
                      aria-label={`${booking.overbooking ? `${t('bookings.overbooking.short')}: ` : ''}${booking.guest_name}, ${formatBookingDateRangeShort(booking.check_in, booking.check_out, dateMonthNames)}${hourly ? `, ${hourSpan(booking)}` : ''}, ${t(`gantt.tone.${tone}`)}${debt > 0 ? `, ${t('gantt.owes', { amount: `${formatMoney(debt, i18n.language)} ${currencySymbol}` })}` : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, booking, row.property.id)}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => {
                        e.stopPropagation()
                        setTooltip(null)
                        // A night with hours on its morning opens the day: both are there.
                        if (lanes?.clocks.has(booking.id)) onHourlyDayOpen(row, dayOf(booking.check_in))
                        else onBookingOpen(booking)
                      }}
                      onMouseEnter={(e) => {
                        if (isCoarsePointer) return
                        const rect = e.currentTarget.getBoundingClientRect()
                        const day = dayOf(booking.check_in)
                        const bookings = lanes?.clocks.has(booking.id)
                          ? [...hoursOn(row.bookings, day).map((part) => part.stay), booking].sort((a, b) => a.check_in.localeCompare(b.check_in))
                          : [booking]
                        showTip({ bookings, x: rect.left + rect.width / 2, y: rect.top })
                      }}
                      onMouseLeave={() => {
                        if (isCoarsePointer) return
                        hideTip()
                      }}
                      className={`absolute flex cursor-pointer items-center gap-1 overflow-hidden rounded-lg shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 ${TONE[tone]} ${
                        hourly || narrow ? 'justify-center' : 'px-2'
                      } ${booking.overbooking ? 'outline outline-2 outline-offset-1 outline-red-600' : ''}`}
                      style={{
                        left: pos.left + 1,
                        width: pos.width - 2,
                        top: BAR_Y + lane * LANE_STEP,
                        height: BAR_H,
                        zIndex: 5,
                        // Hours on the check-in morning sit at the bar's start.
                        paddingLeft: barPadding(pos, lanes?.inside.has(booking.id) ?? false, narrow),
                        // Picking prices or closing, the nights under a bar are picked through it.
                        pointerEvents: tool === 'booking' ? undefined : 'none',
                      }}
                    >
                      {arrivesToday && !hourly && !(narrow && clocked) && <LogIn className="h-3 w-3 shrink-0" aria-hidden="true" />}
                      {/* Two stays in one cell, each by its mark: the hours, then the night */}
                      {clocked && (
                        <>
                          <span className="flex h-4 min-w-4 shrink-0 items-center justify-center gap-px rounded bg-white/90 px-px text-[9px] font-bold text-ink tabular-nums">
                            <Clock className="h-3 w-3" aria-label={t('gantt.hourlyDay', { count: morningCount })} />
                            {/* More than one stay by the hour that morning: how many */}
                            {morningCount > 1 && morningCount}
                          </span>
                          {narrow && <Moon className="h-3 w-3 shrink-0" aria-label={t('properties.form.rentalModeDaily')} />}
                        </>
                      )}
                      {booking.overbooking && (
                        <span className="shrink-0 rounded bg-red-600 px-1 text-[9px] font-bold text-white">!</span>
                      )}
                      {/* One night is one cell: an icon, or the name, never both */}
                      {!(narrow && (clocked || arrivesToday || leavesToday)) && <span className={`min-w-0 font-semibold ${hourly ? 'whitespace-nowrap text-[10px] tracking-tight tabular-nums' : 'truncate text-[11px]'}`}>
                        {hourly ? hourSpan(booking) : booking.guest_name}
                        {!hourly && pos.width >= cellW * 3.5 && booking.source !== 'direct' && (
                          <span className="font-normal opacity-75"> · {t(sourceKeys[booking.source])}</span>
                        )}
                      </span>}
                      {narrow && leavesToday && !clocked && !arrivesToday && <LogOut className="h-3 w-3 shrink-0" aria-hidden="true" />}
                      {!hourly && !narrow && (leavesToday || debt > 0) && (
                        <span className="ml-auto flex shrink-0 items-center gap-1">
                          {leavesToday && <LogOut className="h-3 w-3" aria-hidden="true" />}
                          {debt > 0 && (
                            <span aria-hidden="true" className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${debtTone}`}>
                              {currencySymbol}
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                    {narrow && cellDebt && debtBadge(`debt:${booking.id}`, pos.left + pos.width - 1, BAR_Y + lane * LANE_STEP, cellDebtNow)}
                    </Fragment>
                  )
                })}
                </div>
              )
            })}
          </div>
          </div>
          {/* Edge fades hint that the date track scrolls horizontally. */}
          {scrollShadow.start && (
            <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-black/10 to-transparent" />
          )}
          {scrollShadow.end && (
            <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-black/10 to-transparent" />
          )}
        </div>
      </div>

      {sortedRows.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-ink-muted">{t('gantt.noProperties')}</p>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        // A hover tip shows at once, where it belongs: no fade, no shift after a frame.
        <div
          className="pointer-events-none fixed z-popover max-w-[280px] rounded-xl border border-white/10 bg-gray-950/95 px-3 py-2.5 text-white shadow-lg backdrop-blur-sm"
          style={{ left: tooltip.x, top: tooltip.y - 8, transform: 'translate(-50%, -100%)' }}
        >
          {tooltip.bookings.map((booking, index) => {
            const hourly = isHourlyBooking(booking)
            const debt = owes(booking)
            const on = (value: string) => `${parseDateOnly(value).getDate()} ${dateMonthNames[parseDateOnly(value).getMonth()]}`
            const guests = booking.adults_count + booking.children_count
            return (
              <div key={booking.id} className={index > 0 ? 'mt-2 border-t border-white/10 pt-2' : ''}>
                {/* By the hour or by the night: the mark before the name */}
                <div className="flex items-center gap-1.5">
                  {hourly
                    ? <Clock className="h-3.5 w-3.5 shrink-0 text-gray-300" aria-label={t('properties.form.rentalModeHourly')} />
                    : <Moon className="h-3.5 w-3.5 shrink-0 text-gray-300" aria-label={t('properties.form.rentalModeDaily')} />}
                  <p className="max-w-[160px] truncate text-sm font-semibold text-white">{booking.guest_name}</p>
                  {/* The bar's own word and colour, as the legend has them */}
                  <span className={`ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${TONE[barTone(booking, nowKey)]}`}>
                    {t(`gantt.tone.${barTone(booking, nowKey)}`)}
                  </span>
                </div>
                {hourly ? (
                  <p className="mt-1 text-[11px] text-gray-300 tabular-nums">
                    {on(booking.check_in)}, {booking.check_in.slice(11, 16)}–{booking.check_out.slice(11, 16)}
                    <span className="text-gray-500"> · {t('gantt.hourCount', { count: getBookingHours(booking.check_in, booking.check_out) })}</span>
                  </p>
                ) : (
                  <p className="mt-1 flex items-center gap-1 whitespace-nowrap text-[11px] text-gray-300 tabular-nums">
                    <LogIn className="h-3 w-3 text-gray-400" aria-label={t('properties.checkIn')} />
                    {on(booking.check_in)} {booking.check_in.slice(11, 16)}
                    <LogOut className="ml-2 h-3 w-3 text-gray-400" aria-label={t('properties.checkOut')} />
                    {on(booking.check_out)} {booking.check_out.slice(11, 16)}
                  </p>
                )}
                <p className="mt-1 flex items-center gap-1 whitespace-nowrap text-[11px] text-gray-300">
                  <Users className="h-3 w-3 text-gray-400" aria-hidden="true" />
                  {guests}
                  <span className="text-gray-500">·</span>
                  {t(sourceKeys[booking.source])}
                  <span className="text-gray-500">·</span>
                  <span className="font-semibold text-white">{`${formatMoney(booking.total_price, i18n.language)} ${currencySymbol}`}</span>
                  {debt > 0 && (
                    <span className="ml-1 font-semibold text-red-300">
                      {t('gantt.owes', { amount: `${formatMoney(debt, i18n.language)} ${currencySymbol}` })}
                    </span>
                  )}
                  {toReturn(booking) > 0 && (
                    <span className="ml-1 font-semibold text-amber-300">
                      {t('gantt.toReturn', { amount: `${formatMoney(toReturn(booking), i18n.language)} ${currencySymbol}` })}
                    </span>
                  )}
                </p>
              </div>
            )
          })}
        </div>
      )}
      {/* Where a booking goes, picked from the flats: a panel like the others, so Esc and
          the keyboard work. The booking's own flat is not offered. */}
      <Sheet open={moveRequest !== null} onClose={onMoveClose} title={t('gantt.moveTo')}>
        {moveRequest && (() => {
          const from = sortedRows.find((row) => row.bookings.some((booking) => booking.id === moveRequest.id))
          const targets = sortedRows.filter((row) => row.property.id !== from?.property.id)
          return (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink-muted">
                {moveRequest.guest_name}
                {from && <> · {from.property.internal_name}</>}
              </p>
              {targets.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-3 py-3 text-center text-sm text-ink-muted">{t('gantt.noMoveTargets')}</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {targets.map((row) => {
                    const why = moveRefusal(moveRequest, row)
                    return (
                      <li key={row.property.id}>
                        <button
                          type="button"
                          disabled={why !== null}
                          onClick={() => handleMoveBookingTo(moveRequest, row.property.id)}
                          className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-left text-sm font-semibold text-ink transition-colors hover:bg-surface-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <span className="truncate">{row.property.internal_name}</span>
                          {why && (
                            <span className="shrink-0 rounded-md bg-surface-page px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">{why}</span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })()}
      </Sheet>
      <ConfirmDialog
        open={ruleMove !== null}
        title={t('bookings.stayRules.title')}
        message={(ruleMove?.breaches ?? []).map((breach) => stayRuleText(breach, t)).join('; ')}
        confirmLabel={t('bookings.stayRules.moveAnyway')}
        onConfirm={() => {
          if (ruleMove) void runMove(ruleMove.bookingId, ruleMove.targetPropertyId, true)
          setRuleMove(null)
        }}
        onCancel={() => setRuleMove(null)}
      />
    </motion.div>
  )
}
