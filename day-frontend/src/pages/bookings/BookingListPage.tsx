import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Plus, Search, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useBookings } from '../../hooks/useBookings'
import { useProperties } from '../../hooks/useProperties'
import type { BookingStatus, BookingSource } from '../../types/booking'
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

export default function BookingListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { symbol } = useCurrency()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<BookingSource | 'all'>('all')
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [page, setPage] = useState(1)

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

  const { data: propertiesData } = useProperties({ per_page: 100, status: 'active' })
  const properties = propertiesData?.items ?? []

  const { data, isLoading } = useBookings({
    page,
    per_page: 20,
    status: statusFilter === 'all' ? undefined : statusFilter,
    source: sourceFilter === 'all' ? undefined : sourceFilter,
    property_id: propertyFilter === 'all' ? undefined : propertyFilter,
    search: search || undefined,
  })

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-7xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">{t('bookings.title')}</h1>
          <Link to="/bookings/new">
            <motion.button
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 bg-black text-white hover:bg-gray-800 rounded-xl px-6 py-2.5 font-semibold shadow-lg transition-colors"
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
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
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
            className="self-start"
          >
            {STATUS_TABS.map((tab) => (
              <ToggleGroupItem key={tab.value} value={tab.value}>
                {tab.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* Content */}
        {isLoading ? (
          <Spinner />
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
            {/* Table */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <table className="w-full">
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
                      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
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
                          {formatDate(booking.check_in)} <ArrowRight className="w-3 h-3 inline text-gray-400" /> {formatDate(booking.check_out)}
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
