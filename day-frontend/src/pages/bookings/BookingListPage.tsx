import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useBookings } from '../../hooks/useBookings'
import { useProperties } from '../../hooks/useProperties'
import { useCurrency } from '../../hooks/useCurrency'
import type { Booking, BookingStatus, BookingSource } from '../../types/booking'
import BookingStatusBadge from '../../components/booking/BookingStatusBadge'
import Spinner from '../../components/ui/Spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { dateLocale } from '../../lib/date-locale'
import { formatPhone } from '../../lib/phone'
import { listOwes, stayLine } from '../../lib/booking-list'
import { formatMoneyExact } from '../miniapp/format'

const SOURCES: BookingSource[] = ['direct', 'booking', 'airbnb', 'other', 'crm', 'offer', 'site']
const FIELD = 'h-11 w-full rounded-xl border border-line bg-surface-card px-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent'
// Guest, flat, dates, status, money: one grid for the header and every row on a wide screen.
const COLUMNS = 'lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_9rem_8rem] lg:items-center lg:gap-4'

/** All bookings: found by guest, flat, source and status. A table on a wide screen,
 *  one card per booking on a phone; no switch between the two. */
export default function BookingListPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<BookingSource | 'all'>('all')
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [page, setPage] = useState(1)

  const STATUS_TABS: { value: BookingStatus | 'all'; label: string }[] = [
    { value: 'all', label: t('common.all') },
    { value: 'pending', label: t('common.pending') },
    { value: 'confirmed', label: t('common.confirmed') },
    { value: 'checked_in', label: t('common.checkedIn') },
    { value: 'checked_out', label: t('common.checkedOut') },
    { value: 'completed', label: t('common.completed') },
    { value: 'cancelled', label: t('common.cancelled') },
  ]

  const { data: propertiesData } = useProperties({ per_page: 100, status: 'active' })
  const properties = propertiesData?.items ?? []

  const { data, isLoading, isError, refetch } = useBookings({
    page,
    per_page: 20,
    status: statusFilter === 'all' ? undefined : statusFilter,
    source: sourceFilter === 'all' ? undefined : sourceFilter,
    property_id: propertyFilter === 'all' ? undefined : propertyFilter,
    search: debouncedSearch || undefined,
  })

  // The query fires ~300ms after typing stops.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timeout)
  }, [search])

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
      {/* New bookings start from "Create" in the top bar, on every screen. */}
      <h1 className="mb-5 text-xl font-bold text-ink">{t('bookings.title')}</h1>

      {/* On a phone: search on its own line, the two filters side by side under it. */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:flex">
        <label className="relative col-span-2 sm:flex-1">
          <span className="sr-only">{t('bookings.searchPlaceholder')}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('bookings.searchPlaceholder')}
            className={`${FIELD} pl-9`}
          />
        </label>
        <Select value={propertyFilter} onValueChange={(value) => { setPropertyFilter(value); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder={t('common.allProperties')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.allProperties')}</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.internal_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={(value) => { setSourceFilter(value as BookingSource | 'all'); setPage(1) }}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder={t('common.allSources')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.allSources')}</SelectItem>
            {SOURCES.map((source) => (
              <SelectItem key={source} value={source}>
                {t(`bookings.sources.${source}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* A phone scrolls the statuses sideways rather than wrapping them onto three lines. */}
      <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ToggleGroup
          type="single"
          className="w-max max-w-none flex-nowrap"
          value={statusFilter}
          onValueChange={(value) => {
            if (!value) return
            setStatusFilter(value as BookingStatus | 'all')
            setPage(1)
          }}
        >
          {STATUS_TABS.map((tab) => (
            <ToggleGroupItem key={tab.value} value={tab.value}>
              {tab.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="mb-1 text-sm font-semibold text-ink">{t('common.errorTitle')}</p>
          <p className="mb-4 text-sm text-ink-muted">{t('common.errorLoading')}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="min-h-[44px] rounded-xl border border-line bg-surface-card px-6 text-sm font-semibold text-ink hover:bg-surface-page"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <p className="text-sm text-ink-muted">{t('bookings.noBookings')}</p>
          <Link to="/bookings/new" className="text-sm font-semibold text-accent-ink hover:underline">
            {t('bookings.createFirst')}
          </Link>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface-card">
            <div className={`hidden border-b border-line px-5 py-3 text-xs font-semibold text-ink-muted ${COLUMNS}`} aria-hidden="true">
              <span>{t('bookings.guest')}</span>
              <span>{t('bookings.property')}</span>
              <span>{t('bookings.dates')}</span>
              <span>{t('common.status')}</span>
              <span className="text-right">{t('bookings.total')}</span>
            </div>
            <ul className="divide-y divide-line">
              {data.items.map((booking) => (
                <li key={booking.id}>
                  <BookingRow booking={booking} />
                </li>
              ))}
            </ul>
          </div>

          {data.pages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                aria-label={t('common.previous')}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-ink hover:bg-surface-page disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-3 text-xs font-semibold text-ink-muted">
                {t('common.page', { current: data.page, total: data.pages })}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                disabled={page >= data.pages}
                aria-label={t('common.next')}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-ink hover:bg-surface-page disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function BookingRow({ booking }: { booking: Booking }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { symbol } = useCurrency()
  // "57 000 ₸", as on the booking's screen.
  const money = (value: number) => `${formatMoneyExact(value, i18n.language)} ${symbol}`
  const locale = dateLocale(i18n.language)
  const en = i18n.language === 'en'
  const stay = stayLine(booking, {
    day: (iso) => format(parseISO(iso), 'd', { locale }),
    dayMonth: (iso) => format(parseISO(iso), en ? 'MMM d' : 'd MMM', { locale }),
    nights: (n) => t('bookings.nights', { count: n }),
  })
  const owes = listOwes(booking)
  const total = Number(booking.total_price)
  const paidUp = booking.status !== 'cancelled' && total > 0 && owes === 0
  const flat = booking.property_internal_name || booking.property_name

  return (
    <button
      type="button"
      onClick={() => navigate({ to: '/bookings/$bookingId', params: { bookingId: booking.id } })}
      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-5 py-3.5 text-left transition-colors hover:bg-surface-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${COLUMNS}`}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{booking.guest_name}</span>
        <span className="block truncate text-xs text-ink-muted">
          {booking.guest_phone ? formatPhone(booking.guest_phone) : t('common.noPhone')}
        </span>
      </span>
      {/* On a phone the status sits by the name, the flat and dates under them. */}
      <span className="justify-self-end lg:hidden">
        <BookingStatusBadge status={booking.status} />
      </span>
      <span className="col-span-2 min-w-0 truncate text-sm text-ink lg:col-span-1">
        {flat}
        <span className="text-ink-muted lg:hidden"> · {stay.dates} · {stay.detail}</span>
        <span className="block truncate text-xs text-ink-muted">{t(`bookings.sources.${booking.source}`)}</span>
      </span>
      <span className="hidden min-w-0 lg:block">
        <span className="block text-sm text-ink">{stay.dates}</span>
        <span className="block text-xs text-ink-muted">{stay.detail}</span>
      </span>
      <span className="hidden lg:block">
        <BookingStatusBadge status={booking.status} />
      </span>
      <span className="col-span-2 flex items-baseline justify-between gap-3 lg:col-span-1 lg:block lg:text-right">
        <span className={`block text-sm font-semibold tabular-nums ${booking.status === 'cancelled' ? 'text-ink-muted line-through' : 'text-ink'}`}>
          {money(total)}
        </span>
        {owes > 0 ? (
          <span className="block text-xs font-semibold tabular-nums text-danger">
            {t('gantt.moneyOwes')} {money(owes)}
          </span>
        ) : paidUp ? (
          <span className="block text-xs font-semibold text-success">{t('bookings.card.paid')}</span>
        ) : null}
      </span>
    </button>
  )
}
