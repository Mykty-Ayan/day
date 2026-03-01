import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { BookingStatus } from '../../types/booking'
import type { GanttRow } from './GanttChart'
import { useCurrency } from '../../hooks/useCurrency'

interface Props {
  rows: GanttRow[]
  rangeStart: string
  rangeEnd: string
}

const propertyStatusClass: Record<GanttRow['property']['status'], string> = {
  new: 'border-blue-200 bg-blue-50 text-blue-700',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  paused: 'border-amber-200 bg-amber-50 text-amber-700',
  archived: 'border-gray-200 bg-gray-100 text-gray-600',
}

const bookingStatusClass: Record<BookingStatus, string> = {
  pending: 'border-slate-200 bg-slate-50 text-slate-700',
  confirmed: 'border-sky-200 bg-sky-50 text-sky-700',
  checked_in: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  checked_out: 'border-amber-200 bg-amber-50 text-amber-700',
  completed: 'border-green-200 bg-green-50 text-green-700',
  cancelled: 'border-rose-200 bg-rose-50 text-rose-700',
}

function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

function addDays(dateStr: string, days: number): string {
  const date = parseDateOnly(dateStr)
  date.setDate(date.getDate() + days)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function bookingOverlapsRange(checkIn: string, checkOut: string, rangeStart: string, rangeEnd: string): boolean {
  const bookingStart = parseDateOnly(checkIn)
  const bookingEnd = parseDateOnly(checkOut)
  const viewStart = parseDateOnly(rangeStart)
  const viewEnd = parseDateOnly(rangeEnd)
  viewEnd.setDate(viewEnd.getDate() + 1)
  return bookingStart < viewEnd && bookingEnd > viewStart
}

function formatAgendaDate(dateStr: string): string {
  const date = parseDateOnly(dateStr)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function GanttAgendaView({ rows, rangeStart, rangeEnd }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { symbol: currencySymbol } = useCurrency()

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.property.internal_name.localeCompare(b.property.internal_name)),
    [rows],
  )

  if (sortedRows.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white py-10">
        <p className="text-sm text-gray-500">{t('gantt.noProperties')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sortedRows.map((row, index) => {
        const visibleBookings = row.bookings
          .filter((booking) => bookingOverlapsRange(booking.check_in, booking.check_out, rangeStart, rangeEnd))
          .sort((a, b) => a.check_in.localeCompare(b.check_in))

        return (
          <motion.div
            key={row.property.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.02 }}
            className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm"
          >
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold text-gray-900">{row.property.internal_name}</h2>
                  <span
                    className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${propertyStatusClass[row.property.status]}`}
                  >
                    {t(`common.${row.property.status}`)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">{row.property.name}</p>
              </div>
              <Link
                to="/bookings/new"
                search={{
                  property_id: row.property.id,
                  check_in: rangeStart,
                  check_out: addDays(rangeStart, 1),
                  from: 'gantt',
                } as Record<string, string>}
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-100"
              >
                {t('bookings.addBooking')}
              </Link>
            </div>

            {visibleBookings.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                {t('gantt.noBookingsInRange')}
              </p>
            ) : (
              <div className="space-y-2">
                {visibleBookings.map((booking) => (
                  <button
                    key={booking.id}
                    type="button"
                    onClick={() =>
                      navigate({
                        to: '/bookings/$bookingId',
                        params: { bookingId: booking.id },
                        search: { from: 'gantt' } as Record<string, string>,
                      })
                    }
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900">{booking.guest_name}</p>
                      <span
                        className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold ${bookingStatusClass[booking.status]}`}
                      >
                        {t(
                          booking.status === 'checked_in'
                            ? 'common.checkedIn'
                            : booking.status === 'checked_out'
                              ? 'common.checkedOut'
                              : `common.${booking.status}`,
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">
                      {formatAgendaDate(booking.check_in)} - {formatAgendaDate(booking.check_out)}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <span>{t(`bookings.sources.${booking.source}`)}</span>
                      <span className="text-gray-300">•</span>
                      <span>
                        {t('common.total')}: {currencySymbol}
                        {booking.total_price}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}
