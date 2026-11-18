import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, format, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useAllBookings, useCheckedIn } from '../../hooks/useBookings'
import { useAllProperties } from '../../hooks/useProperties'
import { useCurrency } from '../../hooks/useCurrency'
import { useSettings } from '../../hooks/useSettings'
import { dateLocale } from '../../lib/date-locale'
import { listOwes, stayLine } from '../../lib/booking-list'
import { wallClock } from '../../lib/property-overview'
import {
  byObject,
  bySource,
  madeByDay,
  madeWindow,
  monthFigures,
  occupancyByDay,
  serverMoment,
  shiftMonth,
  stayWindow,
  touched,
  waiting,
} from '../../lib/bookings-dashboard'
import { formatMoneyExact } from '../../pages/miniapp/format'
import type { Booking } from '../../types/booking'
import Button from '../ui/Button'
import Spinner from '../ui/Spinner'

const CARD = 'rounded-2xl border border-line bg-surface-card p-4 sm:p-5'
const LIST_MAX = 5

function useMoney() {
  const { i18n } = useTranslation()
  const { symbol } = useCurrency()
  // "57 000 ₸", as on the booking's screen.
  return (value: number) => `${formatMoneyExact(value, i18n.language)} ${symbol}`
}

const percent = (share: number) => `${Math.round(share * 100)}%`

/** The company's day, moved on every minute: the overview stays open on a desk. */
function useToday(timeZone: string) {
  const [at, setAt] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setAt(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return wallClock(at, timeZone).slice(0, 10)
}

/** A month of bookings at a glance: its figures against the month before, the nights taken and the
 *  bookings made day by day, the objects and the sources, and what waits on someone now.
 *  Money counts every object's bookings, the archived ones too: it was earned. Occupancy counts
 *  the objects at work (active or paused); another object shows in the list only in a month it had guests. */
export default function BookingsDashboard() {
  const { t, i18n } = useTranslation()
  const money = useMoney()
  const locale = dateLocale(i18n.language)
  const settings = useSettings()
  const timeZone = settings.data?.time_zone ?? 'Asia/Almaty'
  const today = useToday(timeZone)
  const [picked, setPicked] = useState<string | null>(null)
  const month = picked ?? today.slice(0, 7)

  const stays = useAllBookings(stayWindow(month))
  const made = useAllBookings(madeWindow(month))
  const open = useAllBookings({ date_from: today })
  // A guest kept past the check-out ends before today and is still in.
  const living = useCheckedIn()
  const objects = useAllProperties()
  const queries = [settings, stays, made, open, living, objects]
  if (queries.some((q) => q.isError)) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3">
        <p className="text-sm text-ink">{t('bookings.overview.failed')}</p>
        <Button variant="secondary" onClick={() => queries.forEach((q) => q.refetch())}>
          {t('common.retry')}
        </Button>
      </div>
    )
  }
  if (!settings.data || !stays.data || !made.data || !open.data || !living.data || !objects.data) return <Spinner />

  const all = objects.data.items
  const atWork = all.filter((p) => p.status === 'active' || p.status === 'paused').map((p) => p.id)
  const busy = touched(stays.data, month)
  const listed = [...atWork, ...all.filter((p) => !atWork.includes(p.id) && busy.has(p.id)).map((p) => p.id)]
  const byId = new Map(all.map((p) => [p.id, p]))
  const now = monthFigures(stays.data, month, atWork)
  const before = monthFigures(stays.data, shiftMonth(month, -1), atWork)
  const nights = occupancyByDay(stays.data, month, atWork)
  const sold = madeByDay(made.data, month, (iso) => wallClock(serverMoment(iso), timeZone).slice(0, 10))
  const sources = bySource(stays.data, month)
  const busiest = byObject(stays.data, month, listed)
  const waits = waiting([...open.data, ...living.data.filter((s) => !open.data.some((o) => o.id === s.id))], today)

  const monthName = format(parseISO(`${month}-01`), 'LLLL yyyy', { locale })
  const was = (value: string) =>
    t('bookings.overview.was', { month: format(parseISO(`${shiftMonth(month, -1)}-01`), 'LLLL', { locale }), value })
  const dayName = (d: string) => format(parseISO(d), 'd MMMM', { locale })
  const tomorrow = format(addDays(parseISO(today), 1), 'yyyy-MM-dd')
  const arrival = (iso: string) => {
    const d = iso.slice(0, 10)
    const time = iso.slice(11, 16)
    if (d === today) return t('bookings.overview.today', { time })
    if (d === tomorrow) return t('bookings.overview.tomorrow', { time })
    return t('bookings.overview.on', { day: format(parseISO(d), 'EEEEEE', { locale }), time })
  }
  const objectName = (id: string) => {
    const p = byId.get(id)
    if (!p) return ''
    const name = p.internal_name || p.name
    return atWork.includes(id) ? name : `${name} · ${t(`properties.statusOne.${p.status}`)}`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setPicked(shiftMonth(month, -1))}
          aria-label={t('bookings.overview.prevMonth')}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-card hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="min-w-[9.5rem] text-center text-base font-semibold text-ink first-letter:uppercase" aria-live="polite">
          {monthName}
        </h2>
        <button
          type="button"
          onClick={() => setPicked(shiftMonth(month, 1))}
          aria-label={t('bookings.overview.nextMonth')}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-card hover:text-ink"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {month !== today.slice(0, 7) && (
          <button type="button" onClick={() => setPicked(null)} className="ml-2 min-h-[40px] text-sm font-semibold text-accent-ink hover:underline">
            {t('bookings.overview.thisMonth')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Figure label={t('bookings.overview.bookings')} value={String(now.bookings)} note={was(String(before.bookings))} />
        <Figure label={t('bookings.overview.booked')} value={money(now.booked)} note={was(money(before.booked))} />
        <Figure
          label={t('bookings.overview.received')}
          value={money(now.received)}
          note={
            now.owes > 0 ? (
              <span className="text-danger">{t('bookings.overview.left', { amount: money(now.owes) })}</span>
            ) : (
              t('bookings.overview.allPaid')
            )
          }
        />
        <Figure label={t('bookings.overview.occupancy')} value={percent(now.occupancy)} note={was(percent(before.occupancy))} meter={now.occupancy} />
        <Figure
          label={t('bookings.overview.nightPrice')}
          value={money(Math.round(now.nightPrice))}
          note={was(money(Math.round(before.nightPrice)))}
        />
        <Figure label={t('bookings.overview.cancelled')} value={String(now.cancelled)} note={was(String(before.cancelled))} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* A month of its own: a day picked in the last one may not exist in this one. */}
        <DayBars
          key={`nights-${month}`}
          title={t('bookings.overview.nights')}
          summary={t('bookings.overview.atWork', { count: atWork.length })}
          points={nights.map((n) => ({ day: n.day, value: n.taken }))}
          max={atWork.length}
          today={today}
          mutePast
          describe={(p) => t('bookings.overview.taken', { day: dayName(p.day), taken: p.value, total: atWork.length })}
        />
        <DayBars
          key={`made-${month}`}
          title={t('bookings.overview.made')}
          summary={t('bookings.overview.madeInMonth', { count: sold.reduce((n, d) => n + d.count, 0) })}
          points={sold.map((d) => ({ day: d.day, value: d.count, sum: d.sum }))}
          max={Math.max(1, ...sold.map((d) => d.count))}
          today={today}
          describe={(p) => t('bookings.overview.madeOn', { day: dayName(p.day), count: p.value, amount: money(p.sum ?? 0) })}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={CARD} aria-label={t('bookings.overview.objects')}>
          <h3 className="mb-4 text-sm font-semibold text-ink">{t('bookings.overview.objects')}</h3>
          <ul className="space-y-3">
            {busiest.map((o) => (
              <Meter key={o.id} name={objectName(o.id)} share={o.occupancy} figure={`${percent(o.occupancy)} · ${money(o.sum)}`} />
            ))}
          </ul>
        </section>
        <section className={CARD} aria-label={t('bookings.overview.sources')}>
          <h3 className="mb-4 text-sm font-semibold text-ink">{t('bookings.overview.sources')}</h3>
          {sources.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('bookings.overview.noArrivals')}</p>
          ) : (
            <ul className="space-y-3">
              {sources.map((s) => (
                <Meter
                  key={s.source}
                  name={t(`bookings.sources.${s.source}`)}
                  share={s.count / sources[0].count}
                  figure={`${s.count} · ${money(s.sum)}`}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <StayList
          title={t('bookings.overview.unconfirmed')}
          stays={waits.unconfirmed}
          empty={t('bookings.overview.allConfirmed')}
          right={(s) => <span className="font-semibold tabular-nums text-ink">{money(Number(s.total_price))}</span>}
        />
        <StayList
          title={t('bookings.overview.owing')}
          total={money(waits.owing.reduce((sum, s) => sum + listOwes(s), 0))}
          stays={waits.owing}
          empty={t('bookings.overview.noDebts')}
          right={(s) => <span className="font-semibold tabular-nums text-danger">{money(listOwes(s))}</span>}
        />
        <StayList
          title={t('bookings.overview.arriving')}
          stays={waits.arriving}
          empty={t('bookings.overview.noArrivalsWeek')}
          right={(s) => <span className="tabular-nums text-ink-muted">{arrival(s.check_in)}</span>}
        />
      </div>
    </div>
  )
}

function Figure({ label, value, note, meter }: { label: string; value: string; note: ReactNode; meter?: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-card px-4 py-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-ink">{value}</p>
      {meter !== undefined && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-page">
          <div className="h-full rounded-full bg-accent" style={{ width: percent(Math.min(1, meter)) }} />
        </div>
      )}
      <p className="mt-1 truncate text-xs tabular-nums text-ink-muted first-letter:uppercase">{note}</p>
    </div>
  )
}

interface Point {
  day: string
  value: number
  sum?: number
}

/** One column per day of the month. Hovering or touching a day reads it out above the chart. */
function DayBars({
  title,
  summary,
  points,
  max,
  today,
  mutePast,
  describe,
}: {
  title: string
  summary: string
  points: Point[]
  max: number
  today: string
  mutePast?: boolean
  describe: (point: Point) => string
}) {
  const [at, setAt] = useState<number | null>(null)
  const marks = new Set([0, 7, 14, 21, 28])
  const todayIndex = points.findIndex((p) => p.day === today)
  return (
    <div className={CARD}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <span className="truncate text-xs tabular-nums text-ink-muted" aria-live="polite">
          {at === null || !points[at] ? summary : describe(points[at])}
        </span>
      </div>
      <div
        className="mt-4 flex h-32 items-end gap-[2px] border-b border-line"
        role="img"
        aria-label={`${title}: ${summary}`}
        onMouseLeave={() => setAt(null)}
      >
        {points.map((p, i) => (
          <div key={p.day} className="flex h-full flex-1 items-end justify-center" onMouseEnter={() => setAt(i)} onClick={() => setAt(i)}>
            <div
              className={`w-full max-w-[24px] rounded-t-[4px] transition-opacity ${
                mutePast && p.day < today ? 'bg-ink-muted/25' : 'bg-accent'
              } ${at !== null && at !== i ? 'opacity-60' : ''}`}
              style={{ height: `${max > 0 ? (p.value / max) * 100 : 0}%`, minHeight: p.value > 0 ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[2px] text-[11px] tabular-nums text-ink-muted" aria-hidden="true">
        {points.map((p, i) => (
          <span key={p.day} className={`flex-1 text-center ${i === todayIndex ? 'font-bold text-accent-ink' : ''}`}>
            {i === todayIndex || (marks.has(i) && (todayIndex < 0 || Math.abs(i - todayIndex) > 2)) ? Number(p.day.slice(8)) : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

function Meter({ name, share, figure }: { name: string; share: number; figure: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm">
      <span className="truncate text-ink">{name}</span>
      <span className="h-2 overflow-hidden rounded-full bg-surface-page">
        <span className="block h-full rounded-full bg-accent" style={{ width: percent(Math.min(1, share)) }} />
      </span>
      <span className="text-right text-xs tabular-nums text-ink-muted">{figure}</span>
    </li>
  )
}

function StayList({
  title,
  total,
  stays,
  empty,
  right,
}: {
  title: string
  total?: string
  stays: Booking[]
  empty: string
  right: (stay: Booking) => ReactNode
}) {
  const { t, i18n } = useTranslation()
  const locale = dateLocale(i18n.language)
  return (
    <section className={CARD} aria-label={title}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">
          {title} <span className="ml-1 tabular-nums text-ink-muted">{stays.length}</span>
        </h3>
        {total && stays.length > 0 && <span className="text-sm font-semibold tabular-nums text-danger">{total}</span>}
      </div>
      {stays.length === 0 ? (
        <p className="text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="-mx-2">
          {stays.slice(0, LIST_MAX).map((s) => {
            const stay = stayLine(s, {
              day: (iso) => format(parseISO(iso), 'd', { locale }),
              dayMonth: (iso) => format(parseISO(iso), i18n.language === 'en' ? 'MMM d' : 'd MMM', { locale }),
              nights: (n) => t('bookings.nights', { count: n }),
            })
            return (
              <li key={s.id}>
                <Link
                  to="/bookings/$bookingId"
                  params={{ bookingId: s.id }}
                  className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-surface-page"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{s.guest_name}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {s.property_internal_name || s.property_name} · {stay.dates}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs">{right(s)}</span>
                </Link>
              </li>
            )
          })}
          {stays.length > LIST_MAX && (
            <li className="px-2 pt-1 text-xs text-ink-muted">{t('bookings.overview.more', { count: stays.length - LIST_MAX })}</li>
          )}
        </ul>
      )}
    </section>
  )
}
