import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { GanttRow } from './GanttChart'
import { useCurrency } from '../../hooks/useCurrency'
import { byCompanyOrder } from '../../lib/chessboard'
import StatusBadge from './StatusBadge'
import BookingStatusBadge from '../booking/BookingStatusBadge'
import { Badge } from '../ui/badge'

interface Props {
  rows: GanttRow[]
  rangeStart: string
  rangeEnd: string
}

// Take only the date component so ISO date-time strings (hourly bookings) parse
// as the correct day instead of an Invalid Date.
function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

// Extract the HH:mm clock component from an ISO date-time string, if present.
function formatTimeOfDay(value: string): string {
  const time = value.split('T')[1]
  return time ? time.slice(0, 5) : ''
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

// Uses the app i18n month names (gantt.monthsShort) instead of the browser locale.
function formatAgendaDate(dateStr: string, monthNames: string[]): string {
  const date = parseDateOnly(dateStr)
  return `${monthNames[date.getMonth()]} ${date.getDate()}`
}

export default function GanttAgendaView({ rows, rangeStart, rangeEnd }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { formatChip } = useCurrency()

  const shortMonthNames = useMemo(
    () => Array.from({ length: 12 }, (_, i) => t(`gantt.monthsShort.${i}`)),
    [t],
  )

  const sortedRows = useMemo(
    () => byCompanyOrder(rows),
    [rows],
  )

  if (sortedRows.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-line bg-surface-card py-10">
        <p className="text-sm text-ink-muted">{t('gantt.noProperties')}</p>
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
            className="rounded-xl border border-line bg-surface-card p-3"
          >
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold text-ink">{row.property.internal_name}</h2>
                  <StatusBadge status={row.property.status} />
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">{row.property.name}</p>
              </div>
              <Link
                to="/bookings/new"
                search={{
                  property_id: row.property.id,
                  check_in: rangeStart,
                  check_out: addDays(rangeStart, 1),
                  from: 'gantt',
                } as Record<string, string>}
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-line bg-surface-page px-3 py-2 text-xs font-bold text-ink transition-colors hover:bg-surface-page"
              >
                {t('bookings.addBooking')}
              </Link>
            </div>

            {visibleBookings.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line bg-surface-page px-3 py-2 text-xs text-ink-muted">
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
                    className={`w-full rounded-lg border border-line bg-surface-page p-3 text-left transition-colors hover:bg-surface-page ${
                      booking.overbooking ? 'outline outline-2 outline-danger outline-offset-1' : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink">
                        {booking.overbooking && (
                          <span className="mr-1.5 inline-flex rounded bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {t('bookings.overbooking.short')}
                          </span>
                        )}
                        {booking.guest_name}
                      </p>
                      <BookingStatusBadge status={booking.status} />
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {booking.rental_mode === 'hourly' ? (
                        <>
                          {formatAgendaDate(booking.check_in, shortMonthNames)}
                          {' · '}
                          {formatTimeOfDay(booking.check_in)}–{formatTimeOfDay(booking.check_out)}
                          <Badge tone="accent" className="ml-1.5">
                            {t('bookings.rentalMode.hourly')}
                          </Badge>
                        </>
                      ) : (
                        <>
                          {formatAgendaDate(booking.check_in, shortMonthNames)} - {formatAgendaDate(booking.check_out, shortMonthNames)}
                        </>
                      )}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      <span>{t(`bookings.sources.${booking.source}`)}</span>
                      <span className="text-ink-muted/60">•</span>
                      <span>
                        {t('common.total')}: {formatChip(booking.total_price)}
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
