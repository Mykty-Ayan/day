import { useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { exportBookings } from '../../api/bookings'
import { SessionChangedError } from '../../api/client'
import { useBookings } from '../../hooks/useBookings'
import { useAllProperties } from '../../hooks/useProperties'
import { useCurrency } from '../../hooks/useCurrency'
import { useSettings } from '../../hooks/useSettings'
import type { Booking, BookingFilters, BookingStatus, BookingSource } from '../../types/booking'
import type { PropertyStatus } from '../../types/property'
import BookingStatusBadge from '../../components/booking/BookingStatusBadge'
import Spinner from '../../components/ui/Spinner'
import { showToast } from '../../components/ui/Toast'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { dateLocale } from '../../lib/date-locale'
import { formatPhone } from '../../lib/phone'
import { listOwes, stayLine } from '../../lib/booking-list'
import { statusKeys } from '../../lib/booking-status'
import { serverMoment } from '../../lib/bookings-dashboard'
import { download, toCsv, type CsvColumn } from '../../lib/csv'
import { wallClock } from '../../lib/property-overview'
import { companyFromToken, sendableFor } from '../../lib/token'
import { formatMoneyExact } from '../miniapp/format'

const SOURCES: BookingSource[] = ['direct', 'booking', 'airbnb', 'other', 'crm', 'offer', 'site']
const FIELD = 'h-11 w-full rounded-xl border border-line bg-surface-card px-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent'
// Guest, flat, dates, status, money: one grid for the header and every row on a wide screen.
const COLUMNS = 'lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_9rem_8rem] lg:items-center lg:gap-4'
const ACTION =
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface-card px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-page disabled:opacity-50'
// The filter lists every object, the ones at work first: an archived object's bookings stay in the list.
const STATUS_ORDER: Record<PropertyStatus, number> = { active: 0, paused: 1, new: 2, archived: 3 }

/** All bookings: found by guest, flat, source and status. A table on a wide screen,
 *  one card per booking on a phone; no switch between the two. */
export default function BookingListPage() {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const [exporting, setExporting] = useState(false)
  // The company this screen shows: another window may sign in to another one while it stays open,
  // and the export must not hand over that company's guests under this screen.
  const [screenCompany] = useState(() => companyFromToken(localStorage.getItem('access_token')))
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

  const { data: propertiesData } = useAllProperties()
  const properties = [...(propertiesData?.items ?? [])].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])

  const filters: BookingFilters = {
    status: statusFilter === 'all' ? undefined : statusFilter,
    source: sourceFilter === 'all' ? undefined : sourceFilter,
    property_id: propertyFilter === 'all' ? undefined : propertyFilter,
    search: debouncedSearch || undefined,
  }
  const { data, isLoading, isError, refetch } = useBookings({ page, per_page: 20, ...filters })

  /** Every booking the list finds, all its pages, as a file for a spreadsheet. */
  async function exportList() {
    const english = i18n.language === 'en'
    const when = (iso: string) =>
      `${english ? iso.slice(0, 10) : `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`} ${iso.slice(11, 16)}`
    const length = (b: Booking) =>
      stayLine(b, { day: () => '', dayMonth: () => '', nights: (n) => t('bookings.nights', { count: n }) }).detail
    // The button waits for the settings: a guessed time zone would shift the day a booking was made.
    if (!settings.data) return
    // A company without its own zone has the server's default, as everywhere in the app.
    const timeZone = settings.data.time_zone ?? 'Asia/Almaty'
    const columns: CsvColumn<Booking>[] = [
      { title: t('bookings.guest'), value: (b) => b.guest_name ?? '' },
      // Without the "+": a cell starting with it would be kept as text behind a visible apostrophe.
      // The spaces keep a spreadsheet from reading the number as a sum.
      { title: t('bookings.phone'), value: (b) => (b.guest_phone ? formatPhone(b.guest_phone).replace(/^\+/, '') : '') },
      { title: t('bookings.property'), value: (b) => b.property_internal_name || b.property_name || '' },
      { title: t('bookings.export.checkIn'), value: (b) => when(b.check_in) },
      { title: t('bookings.export.checkOut'), value: (b) => when(b.check_out) },
      { title: t('bookings.export.length'), value: length },
      { title: t('bookings.source'), value: (b) => t(`bookings.sources.${b.source}`) },
      { title: t('common.status'), value: (b) => t(statusKeys[b.status]) },
      { title: t('bookings.total'), value: (b) => Number(b.total_price) },
      { title: t('bookings.card.paid'), value: (b) => Number(b.paid_amount ?? 0) },
      { title: t('gantt.moneyOwes'), value: (b) => listOwes(b) },
      { title: t('bookings.export.made'), value: (b) => when(wallClock(serverMoment(b.created_at), timeZone)) },
    ]
    // The file is the shown company's: nothing is asked or saved once the session is another one's.
    const company = screenCompany
    if (!company) return
    if (!sendableFor(company, localStorage.getItem('access_token'))) {
      showToast('error', t('bookings.export.otherCompany'))
      return
    }
    setExporting(true)
    try {
      const rows = await exportBookings(filters, company)
      if (!sendableFor(company, localStorage.getItem('access_token'))) throw new SessionChangedError()
      download(toCsv(rows, columns, i18n.language), `bookings-${wallClock(new Date(), timeZone).slice(0, 10)}.csv`)
    } catch (error) {
      const message =
        error instanceof SessionChangedError
          ? 'bookings.export.otherCompany'
          : isAxiosError(error) && error.response?.status === 422
            ? 'bookings.export.tooMany'
            : 'bookings.export.failed'
      showToast('error', t(message))
    } finally {
      setExporting(false)
    }
  }

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
      <div className="mb-5 flex items-center justify-between gap-3">
        {/* New bookings start from "Create" in the top bar, on every screen. */}
        <h1 className="text-xl font-bold text-ink">{t('bookings.title')}</h1>
        <button type="button" onClick={exportList} disabled={exporting || !settings.data} aria-busy={exporting} className={ACTION}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {t('bookings.export.button')}
        </button>
      </div>

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
                {p.status === 'active' ? p.internal_name : `${p.internal_name} · ${t(`properties.statusOne.${p.status}`)}`}
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
      <span className="col-span-2 min-w-0 text-sm text-ink lg:col-span-1">
        <span className="block truncate">{flat}</span>
        {/* On a phone the dates get their own line: a long flat name must not hide them. */}
        <span className="block text-ink lg:hidden">
          {stay.dates} <span className="text-ink-muted">· {stay.detail}</span>
        </span>
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
