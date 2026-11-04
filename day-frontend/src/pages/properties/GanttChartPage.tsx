import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Banknote, ChevronLeft, ChevronRight, Clock, Moon, MousePointer2, Wrench } from 'lucide-react'
import { useQueries } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useGanttData } from '../../hooks/useBookings'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { getPricing } from '../../api/properties'
import GanttChart from '../../components/property/GanttChart'
import type { ChessSelection, ChessTool, GanttRow } from '../../components/property/GanttChart'
import { BlockPanel, BookingPanel, HourlyDayPanel, SelectionPanel } from '../../components/property/GanttPanels'
import { addDays, busyOn } from '../../lib/chessboard'
import type { Booking, GanttBlock } from '../../types/booking'
import type { PricingConfig } from '../../types/property'
import Spinner from '../../components/ui/Spinner'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import GanttAgendaView from '../../components/property/GanttAgendaView'

const TOOLS: Array<{ value: ChessTool; icon: typeof Wrench; labelKey: string }> = [
  { value: 'booking', icon: MousePointer2, labelKey: 'gantt.toolBooking' },
  { value: 'price', icon: Banknote, labelKey: 'gantt.toolPrice' },
  { value: 'close', icon: Wrench, labelKey: 'gantt.toolClose' },
]

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// The month the operator was on: a booking or a flat opened from here comes back to it.
const MONTH_KEY = 'day:gantt:month'
function readMonth(): { year: number; month: number } {
  const now = new Date()
  try {
    const [year, month] = (sessionStorage.getItem(MONTH_KEY) ?? '').split('-').map(Number)
    if (year > 2000 && month >= 0 && month < 12) return { year, month }
  } catch {
    // No storage in a private window: start from today.
  }
  return { year: now.getFullYear(), month: now.getMonth() }
}
// A narrow screen shows the grid or the list, as chosen last time.
const VIEW_KEY = 'day:gantt:view-mode'
type View = 'gantt' | 'agenda'
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'agenda' ? 'agenda' : 'gantt'
  } catch {
    return 'gantt'
  }
}

// Matches the backend DEFAULT_CHECK_IN_HOUR (14:00) used to seed hourly bookings.
const HOURLY_START = '14:00'

const NAV = 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line text-ink transition-colors hover:bg-surface-card'

export default function GanttChartPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [year, setYear] = useState(() => readMonth().year)
  const [month, setMonth] = useState(() => readMonth().month)
  const [todayScrollNonce, setTodayScrollNonce] = useState(0)
  // A wide screen always has the grid; a narrow one picks the grid or the list.
  const wide = useMediaQuery('(min-width: 1024px)')
  const [narrowView, setNarrowView] = useState<View>(readView)
  const view: View = wide ? 'gantt' : narrowView
  const [moveRequest, setMoveRequest] = useState<Booking | null>(null)
  const [tool, setTool] = useState<ChessTool>('booking')
  const [selection, setSelection] = useState<ChessSelection | null>(null)
  const [openBooking, setOpenBooking] = useState<Booking | null>(null)
  const [openBlock, setOpenBlock] = useState<{ block: GanttBlock; row: GanttRow } | null>(null)
  const [openDay, setOpenDay] = useState<{ row: GanttRow; day: string } | null>(null)
  // The day a booking was opened from, to step back to it.
  const [dayBehind, setDayBehind] = useState<{ row: GanttRow; day: string } | null>(null)

  const rangeStartDate = useMemo(() => new Date(year, month - 1, 1), [year, month])
  const rangeEndDate = useMemo(() => new Date(year, month + 2, 0), [year, month])
  const startDate = toDateStr(rangeStartDate)
  const endDate = toDateStr(rangeEndDate)
  // The server takes what starts before end_date's midnight: asked for the last
  // day shown, it would leave out that day's check-ins and closed nights.
  const queryEndDate = toDateStr(new Date(year, month + 2, 1))

  const {
    data: ganttData,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useGanttData(startDate, queryEndDate)

  const rows: GanttRow[] = useMemo(() => {
    if (!ganttData) return []
    return ganttData.properties
      .map((p) => ({
        property: p,
        bookings: p.bookings,
        blocks: p.blocks ?? [],
        dayPrices: p.day_prices ?? [],
      }))
  }, [ganttData])

  const propertyIds = useMemo(() => rows.map((row) => row.property.id), [rows])
  const pricingQueries = useQueries({
    queries: view === 'gantt'
      ? propertyIds.map((propertyId) => ({
          queryKey: ['pricing', propertyId],
          queryFn: () => getPricing(propertyId),
          staleTime: 60_000,
        }))
      : [],
  })

  const pricingByProperty = useMemo(() => {
    return propertyIds.reduce<Record<string, PricingConfig | null | undefined>>((acc, propertyId, index) => {
      acc[propertyId] = pricingQueries[index]?.data
      return acc
    }, {})
  }, [pricingQueries, propertyIds])

  function showMonth(date: Date) {
    setYear(date.getFullYear())
    setMonth(date.getMonth())
    try {
      sessionStorage.setItem(MONTH_KEY, `${date.getFullYear()}-${date.getMonth()}`)
    } catch {
      // Not remembered: the chessboard opens on today next time.
    }
  }

  function shiftMonth(by: number) {
    showMonth(new Date(year, month + by, 1))
  }

  function goToday() {
    showMonth(new Date())
    setTodayScrollNonce((n) => n + 1)
  }

  // A booking with nothing to choose goes straight to the form: free nights of a flat
  // sold by the night, or a day of one sold by the hour. Otherwise the panel asks.
  function select(picked: ChessSelection) {
    const row = rows.find((candidate) => candidate.property.id === picked.propertyIds[0])
    if (tool === 'booking' && row && row.property.status !== 'paused') {
      const busy = busyOn(row, picked.first, picked.last)
      const free = busy.bookings.length === 0 && busy.blocks.length === 0
      const mode = row.property.rental_mode ?? 'daily'
      const search = { property_id: row.property.id, from: 'gantt' }
      if (mode === 'hourly') {
        navigate({ to: '/bookings/new', search: { ...search, check_in: `${picked.first}T${HOURLY_START}` } as Record<string, string> })
        return
      }
      if (mode === 'daily' && free) {
        navigate({ to: '/bookings/new', search: { ...search, check_in: picked.first, check_out: addDays(picked.last, 1) } as Record<string, string> })
        return
      }
    }
    setSelection(picked)
  }

  const legend = (
    <>
      <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-success" />{t('gantt.tone.inHouse')}</li>
      <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-accent" />{t('gantt.tone.confirmed')}</li>
      <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded border border-dashed border-accent bg-accent-soft" />{t('gantt.tone.pending')}</li>
      <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-warning-soft ring-1 ring-inset ring-warning/50" />{t('gantt.tone.late')}</li>
      <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-line" />{t('gantt.tone.done')}</li>
      <li className="flex items-center gap-1.5"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white">₸</span>{t('gantt.legendDebt')}</li>
      <li className="flex items-center gap-1.5"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-warning-soft text-[9px] font-bold text-warning">₸</span>{t('gantt.legendDebtLater')}</li>
      <li className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{t('properties.form.rentalModeHourly')}</li>
      <li className="flex items-center gap-1.5"><Moon className="h-3.5 w-3.5" aria-hidden="true" />{t('properties.form.rentalModeDaily')}</li>
      <li className="flex items-center gap-1.5"><span className="h-3 w-5 rounded" style={{ background: 'repeating-linear-gradient(45deg, #e2e2e8 0 4px, #f2f3f7 4px 8px)' }} />{t('gantt.closed')}</li>
      <li className="flex items-center gap-1.5"><span className="font-semibold text-violet-700">₸27k</span>{t('gantt.legendOwn')}</li>
    </>
  )

  // The three months on the grid, as the axis shows them.
  const period = `${t(`gantt.monthsShort.${rangeStartDate.getMonth()}`)} ${rangeStartDate.getFullYear() !== rangeEndDate.getFullYear() ? rangeStartDate.getFullYear() : ''} – ${t(`gantt.monthsShort.${rangeEndDate.getMonth()}`)} ${rangeEndDate.getFullYear()}`.replace(/\s+/g, ' ')

  return (
    <div className="max-w-full px-4 py-4 sm:px-6 sm:py-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* A phone's top bar already names the screen. */}
          <h1 className="hidden text-xl font-bold text-ink sm:block">{t('gantt.title')}</h1>
          <div className="flex items-center gap-2">
            <button type="button" onClick={goToday} className="inline-flex h-10 items-center rounded-lg border border-line px-3 text-xs font-bold text-ink transition-colors hover:bg-surface-card">
              {t('gantt.today')}
            </button>
            <button type="button" aria-label={t('gantt.prevMonth')} onClick={() => shiftMonth(-1)} className={NAV}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-0 flex-1 text-center text-sm font-bold text-ink sm:flex-none sm:min-w-[150px]">{period}</span>
            <button type="button" aria-label={t('gantt.nextMonth')} onClick={() => shiftMonth(1)} className={NAV}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {!wide && (
          <ToggleGroup
            type="single"
            value={narrowView}
            aria-label={t('gantt.view')}
            className="mb-3"
            onValueChange={(value) => {
              if (!value) return
              setNarrowView(value as View)
              try {
                localStorage.setItem(VIEW_KEY, value)
              } catch {
                // Not remembered: the grid next time.
              }
            }}
          >
            <ToggleGroupItem value="gantt">{t('gantt.viewGrid')}</ToggleGroupItem>
            <ToggleGroupItem value="agenda">{t('gantt.viewList')}</ToggleGroupItem>
          </ToggleGroup>
        )}

        {view === 'gantt' && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <ToggleGroup
              type="single"
              value={tool}
              aria-label={t('gantt.tools')}
              onValueChange={(value) => {
                if (value) setTool(value as ChessTool)
              }}
            >
              {TOOLS.map(({ value, icon: Icon, labelKey }) => (
                <ToggleGroupItem key={value} value={value}>
                  <Icon className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t(labelKey)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {/* What the marks mean: in a line on a wide screen, behind a button on a narrow one */}
            <ul className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted lg:flex" aria-label={t('gantt.legend')}>
              {legend}
            </ul>
            <details className="text-xs text-ink-muted lg:hidden">
              <summary className="cursor-pointer select-none rounded-lg px-2 py-1.5 font-semibold text-ink hover:bg-surface-card">{t('gantt.legend')}</summary>
              <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5" aria-label={t('gantt.legend')}>
                {legend}
              </ul>
            </details>
          </div>
        )}

        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-danger-soft bg-danger-soft/50 py-10">
            <p className="text-sm font-semibold text-danger">{t('gantt.failedLoad')}</p>
            {error instanceof Error && <p className="max-w-xl px-4 text-center text-xs text-danger">{error.message}</p>}
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="rounded-xl border border-line bg-surface-card px-4 py-2 text-xs font-bold text-ink transition-colors hover:bg-surface-page disabled:opacity-60"
            >
              {t('common.retry')}
            </button>
          </div>
        ) : view === 'agenda' ? (
          <GanttAgendaView rows={rows} rangeStart={startDate} rangeEnd={endDate} />
        ) : (
          <GanttChart
            rows={rows}
            year={year}
            month={month}
            rangeStart={startDate}
            rangeEnd={endDate}
            todayScrollNonce={todayScrollNonce}
            pricingByProperty={pricingByProperty}
            tool={tool}
            selected={selection}
            onSelect={select}
            onBookingOpen={setOpenBooking}
            onBlockOpen={(block, row) => setOpenBlock({ block, row })}
            onHourlyDayOpen={(row, day) => setOpenDay({ row, day })}
            moveRequest={moveRequest}
            onMoveClose={() => setMoveRequest(null)}
          />
        )}
        <SelectionPanel
          tool={tool}
          selection={selection}
          rows={rows}
          pricingByProperty={pricingByProperty}
          onClose={() => setSelection(null)}
          onDone={() => {
            setSelection(null)
            setTool('booking')
          }}
        />
        <BookingPanel
          booking={openBooking}
          onClose={() => {
            setOpenBooking(null)
            setDayBehind(null)
          }}
          onMove={setMoveRequest}
          onBack={
            dayBehind
              ? () => {
                  // The day as it is now: a payment or a move may have changed it.
                  const row = rows.find((candidate) => candidate.property.id === dayBehind.row.property.id) ?? dayBehind.row
                  setOpenBooking(null)
                  setDayBehind(null)
                  setOpenDay({ row, day: dayBehind.day })
                }
              : undefined
          }
        />
        <HourlyDayPanel
          open={openDay}
          onClose={() => setOpenDay(null)}
          onBookingOpen={(booking) => {
            setDayBehind(openDay)
            setOpenBooking(booking)
          }}
        />
        <BlockPanel block={openBlock?.block ?? null} row={openBlock?.row ?? null} onClose={() => setOpenBlock(null)} />
      </motion.div>
    </div>
  )
}
