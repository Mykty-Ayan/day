import { useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import {
  Banknote,
  BedDouble,
  CalendarX,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock,
  LogIn,
  LogOut,
  SprayCan,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { TODAY_REFRESH, useTodayChecks, useChangeBookingStatus } from '../../hooks/useBookings'
import { useCleaningTasks } from '../../hooks/useCleaning'
import { useCurrency } from '../../hooks/useCurrency'
import { useAllProperties } from '../../hooks/useProperties'
import { dateLocale } from '../../lib/date-locale'
import { attentionItems, hourlyStays, occupiedTonight, totalDebt, type AttentionItem, type StayStage } from '../../lib/today-attention'
import { formatMoney, formatTime, toISODate } from '../miniapp/format'
import type { Booking, BookingStatus, TodayChecks } from '../../types/booking'
import BookingStatusBadge from '../../components/booking/BookingStatusBadge'
import ExtendStayButton from '../../components/booking/ExtendStayButton'
import TakePaymentPanel from '../../components/booking/TakePaymentPanel'
import AssignCleanersPanel from '../../components/cleaning/AssignCleanersPanel'
import { Badge } from '../../components/ui/badge'
import Spinner from '../../components/ui/Spinner'

export default function TodayPage() {
  const { t, i18n } = useTranslation()
  // Read at each refresh, so a screen left open turns the page at midnight.
  const { data, isLoading, isError, dataUpdatedAt } = useTodayChecks()
  const now = dataUpdatedAt ? new Date(dataUpdatedAt) : new Date()
  const today = toISODate(now)
  const cleaning = useCleaningTasks({ due_by: today, per_page: 100 }, TODAY_REFRESH)

  const items = data ? attentionItems(data, cleaning.data?.items ?? [], today) : []
  const checkIns = byTime(data?.check_ins ?? [], 'check_in')
  const inHouse = data?.in_house ?? []
  // An hourly stay leaves the day it arrives: it is shown once, where it is now.
  const checkOuts = goneLast(byTime(data?.check_outs ?? [], 'check_out')).filter(
    (booking) => ![...inHouse, ...checkIns].some((stay) => stay.id === booking.id),
  )

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-5xl mx-auto w-full">
      <div className="mb-6 flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-xl font-bold text-ink">{t('today.title')}</h1>
        <p className="text-sm text-ink-muted">{longDate(now, i18n.language)}</p>
      </div>

      {isLoading ? (
        <Spinner />
      ) : !data ? (
        <p className="text-sm text-danger">{t('common.errorLoading')}</p>
      ) : (
        <div className="space-y-6">
          {isError && <p role="alert" className="text-sm text-danger">{t('today.refreshFailed')}</p>}
          <DaySummary checks={data} debt={totalDebt(items)} today={today} />
          <AttentionCard items={items} today={today} cleaningLoading={cleaning.isLoading} cleaningFailed={cleaning.isError} />
          <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2 xl:grid-cols-3">
            <TodayList
              icon={LogIn}
              title={t('today.checkInsToday')}
              empty={t('today.noCheckIns')}
              bookings={checkIns}
              detail={(booking) => t('today.from', { time: formatTime(booking.check_in, i18n.language) })}
              actions={(booking) =>
                booking.status === 'confirmed' ? (
                  <StatusButton booking={booking} icon={LogIn} label={t('bookings.status.checkIn')} target="checked_in" />
                ) : (
                  <StatusButton booking={booking} icon={Check} label={t('today.confirm')} target="confirmed" />
                )
              }
            />
            <TodayList
              icon={LogOut}
              title={t('today.checkOutsToday')}
              empty={t('today.noCheckOuts')}
              bookings={checkOuts}
              detail={(booking) => t('today.until', { time: formatTime(booking.check_out, i18n.language) })}
              actions={(booking) =>
                booking.status === 'checked_in' ? (
                  <>
                    <StatusButton booking={booking} icon={LogOut} label={t('bookings.status.checkOut')} target="checked_out" />
                    <ExtendStayButton booking={booking} className={ROW_BUTTON} />
                  </>
                ) : gone(booking) ? (
                  <Badge>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('common.checkedOut')}
                  </Badge>
                ) : (
                  <BookingStatusBadge status={booking.status} />
                )
              }
            />
            <TodayList
              icon={Users}
              title={t('today.inHouse')}
              empty={t('today.noGuests')}
              bookings={inHouse}
              detail={(booking) =>
                t('today.until', {
                  time: booking.check_out.slice(0, 10) === today
                    ? formatTime(booking.check_out, i18n.language)
                    : formatDate(booking.check_out, i18n.language),
                })
              }
              actions={(booking) => (
                <>
                  {booking.check_out.slice(0, 10) === today && (
                    <StatusButton booking={booking} icon={LogOut} label={t('bookings.status.checkOut')} target="checked_out" />
                  )}
                  <ExtendStayButton booking={booking} className={ROW_BUTTON} />
                </>
              )}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function DaySummary({ checks, debt, today }: { checks: TodayChecks; debt: number; today: string }) {
  const { t, i18n } = useTranslation()
  const { data: properties } = useAllProperties({ status: 'active' })
  const { symbol } = useCurrency()
  const money = (value: number) => formatMoney(value, i18n.language)
  const linkClass = 'inline-flex items-center gap-1.5 transition-colors hover:text-accent-ink hover:underline'
  const iconClass = 'h-4 w-4 text-ink-muted'
  const hourly = hourlyStays(checks)

  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-ink">
      {properties && (
        <>
          <Link to="/properties/gantt" className={linkClass}>
            <BedDouble className={iconClass} aria-hidden="true" />
            {t('today.summaryOccupied', { busy: occupiedTonight(checks, today), total: properties.total })}
            {hourly > 0 && `, ${t('today.summaryHourly', { stays: hourly })}`}
          </Link>
          <span className="text-ink-muted">·</span>
        </>
      )}
      {checks.received_today != null && (
        <>
          <Link to="/analytics" className={linkClass}>
            <Banknote className={iconClass} aria-hidden="true" />
            {t('today.summaryReceived', { amount: money(Number(checks.received_today)), symbol })}
          </Link>
          <span className="text-ink-muted">·</span>
        </>
      )}
      <a href="#attention" className={linkClass}>
        <Wallet className={iconClass} aria-hidden="true" />
        {t('today.summaryDebt', { amount: money(debt), symbol })}
      </a>
    </p>
  )
}

const ATTENTION_LIMIT = 5

function AttentionCard({
  items,
  today,
  cleaningLoading,
  cleaningFailed,
}: {
  items: AttentionItem[]
  today: string
  cleaningLoading: boolean
  cleaningFailed: boolean
}) {
  const { t } = useTranslation()
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? items : items.slice(0, ATTENTION_LIMIT)

  return (
    <section id="attention" className="rounded-xl border border-line bg-surface-card px-4 py-3">
      <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
        <CircleAlert className={`h-4 w-4 ${items.length > 0 ? 'text-danger' : 'text-ink-muted'}`} aria-hidden="true" />
        {t('today.needsAttention')}
        {items.length > 0 && <span className="font-semibold text-ink-muted">({items.length})</span>}
      </h2>
      {items.length === 0 && !cleaningLoading && !cleaningFailed && (
        <p className="mt-2 flex items-center gap-2 text-sm text-success">
          <CircleCheck className="h-4 w-4" aria-hidden="true" />
          {t('today.nothingNeedsAttention')}
        </p>
      )}
      {items.length > 0 && (
        <ul className="mt-2 divide-y divide-line">
          {shown.map((item) => (
            <li key={attentionKey(item)}>
              <AttentionRow item={item} today={today} />
            </li>
          ))}
        </ul>
      )}
      {items.length > ATTENTION_LIMIT && (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          className="min-h-[44px] text-xs font-bold text-accent-ink lg:min-h-[36px]"
        >
          {showAll ? t('today.showLess') : t('today.showAll', { total: items.length })}
        </button>
      )}
      {cleaningFailed && <p className="mt-1 text-sm text-danger">{t('today.cleaningFailed')}</p>}
    </section>
  )
}

function attentionKey(item: AttentionItem): string {
  if (item.kind === 'noCleaner') return 'cleaning'
  return `${item.kind}-${item.kind === 'lateCleaning' ? item.task.id : item.booking.id}`
}

const STAGE_KEYS: Record<StayStage, string> = {
  arrives: 'today.arrivesToday',
  leaves: 'today.leavesToday',
  staying: 'today.staying',
  left: 'today.leftEarlier',
  notArrived: 'today.arrivedOn',
}

function AttentionRow({ item, today }: { item: AttentionItem; today: string }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const { symbol } = useCurrency()

  if (item.kind === 'lateCleaning') {
    const { task } = item
    const day = task.scheduled_date ? formatDate(task.scheduled_date, i18n.language) : ''
    return (
      <Link to="/cleaning/$taskId" params={{ taskId: task.id }} className="block">
        <AttentionLine
          icon={SprayCan}
          tone="text-warning"
          problem={t('today.cleaningOverdue')}
          where={[task.property_name || task.property_internal_name, task.cleaner_name, day].filter(Boolean).join(' · ')}
          action={t('today.openCleaning')}
        />
      </Link>
    )
  }

  if (item.kind === 'unclosed') {
    const { booking } = item
    const inside = booking.status === 'checked_in'
    return (
      <Link to="/bookings/$bookingId" params={{ bookingId: booking.id }} className="block">
        <AttentionLine
          icon={inside ? LogOut : LogIn}
          tone="text-warning"
          problem={t(inside ? 'today.notCheckedOut' : 'today.notCheckedIn')}
          where={`${booking.property_name || booking.property_internal_name} · ${booking.guest_name} · ${t(
            inside ? 'today.leftOn' : 'today.arrivedOn',
            { date: formatDate(inside ? booking.check_out : booking.check_in, i18n.language) },
          )}`}
          action={t('today.openBooking')}
        />
      </Link>
    )
  }

  if (item.kind === 'noCleaner') {
    const flats = item.tasks
      .map((task) => {
        const flat = task.property_name || task.property_internal_name
        return task.arrivesAt ? t('today.cleanBefore', { flat, time: task.arrivesAt }) : flat
      })
      .join(', ')
    const when = item.tasks.some((task) => task.late) ? t('today.cleaningLate') : t('today.cleaningToday')
    return (
      <>
        <button type="button" onClick={() => setOpen(true)} className="w-full text-left">
          <AttentionLine
            icon={SprayCan}
            tone="text-warning"
            problem={t('today.noCleanerTitle', { count: item.tasks.length })}
            where={`${flats} · ${when}`}
            action={t('today.assign')}
          />
        </button>
        <AssignCleanersPanel tasks={item.tasks} open={open} onClose={() => setOpen(false)} />
      </>
    )
  }

  const { booking } = item
  const flat = booking.property_name || booking.property_internal_name
  // A guest who left early has a last day still ahead: they left by today.
  const leftOn = booking.check_out.slice(0, 10) > today ? today : booking.check_out
  const stage = t(STAGE_KEYS[item.stage], {
    date: formatDate(item.stage === 'notArrived' ? booking.check_in : leftOn, i18n.language),
  })
  const where = `${flat} · ${booking.guest_name} · ${stage}`
  const stayDebt = item.kind === 'debt' ? item.amount - item.orders : 0

  if (item.kind === 'overbooking' || stayDebt <= 0) {
    // A double booking, or a debt of minibar orders only: both are settled elsewhere.
    return (
      <Link to="/bookings/$bookingId" params={{ bookingId: booking.id }} className="block">
        <AttentionLine
          icon={item.kind === 'debt' ? Wallet : CalendarX}
          tone="text-danger"
          problem={
            item.kind === 'debt'
              ? t('today.debtTitle', { amount: formatMoney(item.amount, i18n.language), symbol })
              : t('bookings.overbooking.short')
          }
          where={where}
          action={item.kind === 'debt' ? t('today.openBooking') : t('today.resolve')}
        />
      </Link>
    )
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-full text-left">
        <AttentionLine
          icon={Wallet}
          tone="text-danger"
          problem={t('today.debtTitle', { amount: formatMoney(item.amount, i18n.language), symbol })}
          where={where}
          action={t('today.takePayment')}
        />
      </button>
      <TakePaymentPanel
        booking={booking}
        stayDebt={stayDebt}
        ordersDue={item.orders}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

function AttentionLine({
  icon: Icon,
  tone,
  problem,
  where,
  action,
}: {
  icon: LucideIcon
  tone: string
  problem: string
  where: string
  action: string
}) {
  return (
    <span className="group flex min-h-[44px] items-center gap-3 py-2">
      <Icon className={`h-4 w-4 shrink-0 ${tone}`} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-semibold ${tone}`}>{problem}</span>
        <span className="block text-xs text-ink-muted">{where}</span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-xs font-bold text-accent-ink group-hover:underline">
        {action}
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </span>
  )
}

const ROW_BUTTON =
  'inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-ink transition-colors hover:bg-surface-page disabled:opacity-50 lg:min-h-[36px]'

function StatusButton({
  booking,
  icon: Icon,
  label,
  target,
}: {
  booking: Booking
  icon: LucideIcon
  label: string
  target: BookingStatus
}) {
  const { t } = useTranslation()
  const changeStatus = useChangeBookingStatus(booking.id)

  return (
    <>
      <button
        type="button"
        onClick={() => changeStatus.mutate(target)}
        disabled={changeStatus.isPending}
        className={ROW_BUTTON}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {changeStatus.isPending ? '…' : label}
      </button>
      {changeStatus.isError && (
        <p role="alert" className="max-w-28 text-xs text-danger">{t('today.statusFailed')}</p>
      )}
    </>
  )
}

function TodayList({
  icon: Icon,
  title,
  empty,
  bookings,
  detail,
  actions,
}: {
  icon: LucideIcon
  title: string
  empty: string
  bookings: Booking[]
  detail: (booking: Booking) => string
  actions: (booking: Booking) => ReactNode
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
        <Icon className="h-4 w-4 text-ink-muted" />
        {title}
        <span className="font-semibold text-ink-muted">({bookings.length})</span>
      </h2>
      {bookings.length === 0 ? (
        <p className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-card px-4 py-5 text-sm text-ink-muted">
          <Icon className="h-4 w-4" aria-hidden="true" />
          {empty}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface-card px-4">
          {bookings.map((booking) => (
            <li key={booking.id} className="flex items-center justify-between gap-3 py-3">
              <TodayRow booking={booking} detail={detail(booking)} />
              <div className="flex shrink-0 flex-col gap-1.5">{actions(booking)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function TodayRow({ booking, detail }: { booking: Booking; detail: string }) {
  const { t } = useTranslation()

  return (
    <Link to="/bookings/$bookingId" params={{ bookingId: booking.id }} className="min-w-0 flex-1">
      <span className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: booking.gantt_color || '#3B82F6' }} />
        <span className={`truncate text-sm font-semibold ${gone(booking) ? 'text-ink-muted' : 'text-ink'}`}>
          {booking.property_name || booking.property_internal_name}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-sm text-ink-muted">{booking.guest_name}</span>
      <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
        <Clock className="h-3 w-3" aria-hidden="true" />
        {detail}
      </span>
      {booking.property_status === 'archived' && (
        <Badge tone="danger" className="mt-1">{t('today.propertyArchived')}</Badge>
      )}
    </Link>
  )
}

const gone = (booking: Booking) => booking.status === 'checked_out' || booking.status === 'completed'

function byTime(bookings: Booking[], field: 'check_in' | 'check_out'): Booking[] {
  return [...bookings].sort((a, b) => a[field].localeCompare(b[field]))
}

/** A guest who has left stays on the list for the cleaning, under those still to leave. */
function goneLast(bookings: Booking[]): Booking[] {
  return [...bookings].sort((a, b) => Number(gone(a)) - Number(gone(b)))
}

function longDate(date: Date, language: string): string {
  return format(date, language === 'en' ? 'EEEE, MMMM d' : 'EEEE, d MMMM', { locale: dateLocale(language) })
}

function formatDate(dateStr: string, language: string): string {
  return format(new Date(dateStr), language === 'en' ? 'MMM d' : 'd MMM', { locale: dateLocale(language) })
}
