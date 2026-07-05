import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Plus, Search, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useBookings } from '../../hooks/useBookings'
import { useProperties } from '../../hooks/useProperties'
import type { BookingStatus, BookingSource } from '../../types/booking'
import type { ViewMode } from '../../types/view-mode'
import { isViewMode } from '../../types/view-mode'
import BookingStatusBadge from '../../components/booking/BookingStatusBadge'
import { useCurrency } from '../../hooks/useCurrency'
import Spinner from '../../components/ui/Spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'

const BOOKING_LIST_VIEW_MODE_STORAGE_KEY = 'day:bookings:list-view-mode'

function readInitialViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'table'

  try {
    const stored = window.localStorage.getItem(BOOKING_LIST_VIEW_MODE_STORAGE_KEY)
    if (isViewMode(stored)) {
      return stored
    }
  } catch {
    // Ignore storage errors and fallback to viewport-aware default.
  }

  return window.matchMedia('(max-width: 1023px)').matches ? 'cards' : 'table'
}

export default function BookingListPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { symbol } = useCurrency()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<BookingSource | 'all'>('all')
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [viewMode, setViewMode] = useState<ViewMode>(() => readInitialViewMode())

  const STATUS_TABS: { value: BookingStatus | 'all'; label: string }[] = [
    { value: 'all', label: t('common.all') },
    { value: 'pending', label: t('common.pending') },
    { value: 'confirmed', label: t('common.confirmed') },
    { value: 'checked_in', label: t('common.checkedIn') },
    { value: 'completed', label: t('common.completed') },
    { value: 'cancelled', label: t('common.cancelled') },
  ]

  const SOURCE_OPTIONS: { value: BookingSource | 'all'; label: string }[] = [
    { value: 'all', label: t('common.allSources') },
    { value: 'direct', label: t('bookings.sources.direct') },
    { value: 'booking', label: t('bookings.sources.booking') },
    { value: 'airbnb', label: t('bookings.sources.airbnb') },
    { value: 'other', label: t('bookings.sources.other') },
  ]
  const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
    { value: 'cards', label: t('common.cards') },
    { value: 'table', label: t('common.table') },
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

  // Debounce the search input so the query fires ~300ms after typing stops.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timeout)
  }, [search])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(BOOKING_LIST_VIEW_MODE_STORAGE_KEY, viewMode)
    } catch {
      // Ignore storage write errors.
    }
  }, [viewMode])

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-7xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold text-gray-900">{t('bookings.title')}</h1>
          <Link to="/bookings/new">
            <motion.button
              whileTap={{ scale: 0.97 }}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-2.5 font-semibold text-white shadow-lg transition-colors hover:bg-gray-800 sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              {t('bookings.newBooking')}
            </motion.button>
          </Link>
        </div>

        {/* Search and filters */}
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('bookings.searchPlaceholder')}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 pl-9 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
              />
            </div>
            <Select
              value={propertyFilter}
              onValueChange={(value) => { setPropertyFilter(value); setPage(1) }}
            >
              <SelectTrigger className="w-full sm:w-56">
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
            <Select
              value={sourceFilter}
              onValueChange={(value) => { setSourceFilter(value as BookingSource | 'all'); setPage(1) }}
            >
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder={t('common.allSources')} />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ToggleGroup
            type="single"
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
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => {
              if (!value) return
              setViewMode(value as ViewMode)
            }}
          >
            {VIEW_OPTIONS.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* Content */}
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="mb-1 text-sm font-semibold text-gray-900">{t('common.errorTitle')}</p>
            <p className="mb-4 text-sm text-gray-500">{t('common.errorLoading')}</p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => refetch()}
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-2.5 font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              {t('common.retry')}
            </motion.button>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-sm text-gray-500 mb-4">{t('bookings.noBookings')}</p>
            <Link to="/bookings/new">
              <motion.button
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 bg-black text-white hover:bg-gray-800 rounded-xl px-6 py-2.5 font-semibold shadow-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t('bookings.createFirst')}
              </motion.button>
            </Link>
          </div>
        ) : (
          <>
            {viewMode === 'cards' ? (
              <div className="space-y-3">
                {data.items.map((booking, i) => (
                  <motion.button
                    key={booking.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.02 }}
                    onClick={() => navigate({ to: '/bookings/$bookingId', params: { bookingId: booking.id } })}
                    type="button"
                    className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-gray-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: booking.gantt_color || '#3B82F6' }}
                          />
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {booking.property_internal_name || booking.property_name}
                          </p>
                        </div>
                        <p className="mt-1 text-sm text-gray-700">{booking.guest_name}</p>
                        <p className="mt-0.5 text-xs text-gray-500">{booking.guest_phone || t('common.noPhone')}</p>
                      </div>
                      <BookingStatusBadge status={booking.status} />
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-600 sm:grid-cols-2">
                      <span>
                        {formatDate(booking.check_in, i18n.language)} <ArrowRight className="inline h-3 w-3 text-gray-400" /> {formatDate(booking.check_out, i18n.language)}
                      </span>
                      <span className="capitalize sm:text-right">{t('bookings.sources.' + booking.source)}</span>
                      <span className="font-semibold text-gray-900 sm:col-span-2 sm:text-right">
                        {symbol}{booking.total_price.toLocaleString()}
                      </span>
                    </div>
                  </motion.button>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="w-full overflow-x-auto">
                  <table className="w-full min-w-[720px]">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('bookings.property')}</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('bookings.guest')}</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('bookings.dates')}</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('common.status')}</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('bookings.source')}</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('bookings.total')}</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((booking, i) => (
                        <motion.tr
                          key={booking.id}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: i * 0.02 }}
                          onClick={() => navigate({ to: '/bookings/$bookingId', params: { bookingId: booking.id } })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              navigate({ to: '/bookings/$bookingId', params: { bookingId: booking.id } })
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          aria-label={`${booking.property_internal_name || booking.property_name} — ${booking.guest_name}`}
                          className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black/20"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: booking.gantt_color || '#3B82F6' }}
                              />
                              <span className="text-sm font-medium text-gray-900 truncate max-w-[160px]">
                                {booking.property_internal_name || booking.property_name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="text-sm text-gray-700">{booking.guest_name}</span>
                              <span className="text-xs text-gray-400">{booking.guest_phone || t('common.noPhone')}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600">
                              {formatDate(booking.check_in, i18n.language)} <ArrowRight className="w-3 h-3 inline text-gray-400" /> {formatDate(booking.check_out, i18n.language)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <BookingStatusBadge status={booking.status} />
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-gray-500 capitalize">{t('bookings.sources.' + booking.source)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-gray-900">
                              {symbol}{booking.total_price.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <ChevronRight className="w-4 h-4 text-gray-300" />
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Pagination */}
            {data.pages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </motion.button>
                <span className="text-xs font-bold text-gray-500 px-3">
                  {t('common.page', { current: data.page, total: data.pages })}
                </span>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                  disabled={page >= data.pages}
                  className="p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </motion.button>
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  )
}

function formatDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}
