import { useState } from 'react'
import { differenceInCalendarDays, format } from 'date-fns'
import { Pencil, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useProperty } from '../../hooks/useProperties'
import { editableBlocks } from '../../lib/booking-edit'
import { dateLocale } from '../../lib/date-locale'
import type { bookingMoney } from '../../lib/booking-money'
import type { Booking, BookingDeposit } from '../../types/booking'
import BookingActions from './BookingActions'
import BookingEditSheet from './BookingEditSheet'
import BookingStatusBadge from './BookingStatusBadge'

/** The stay at a glance: the flat, the way from arrival to departure, what to do next. */
export default function StayCard({
  booking,
  money,
  deposits,
}: {
  booking: Booking
  money: ReturnType<typeof bookingMoney>
  deposits: BookingDeposit[]
}) {
  const { t } = useTranslation()
  const [editingDates, setEditingDates] = useState(false)
  const { data: property } = useProperty(booking.property_id)
  const photos = property?.photos ?? []
  const cover = photos.find((photo) => photo.is_cover) ?? photos[0]
  const flat = booking.property_internal_name || booking.property_name
  const guests = t('bookings.adultsCount', { count: booking.adults_count })
  const children = booking.children_count > 0 ? `, ${t('bookings.childrenCount', { count: booking.children_count })}` : ''

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface-card md:flex">
      {cover && (
        <div className="h-36 shrink-0 bg-surface-page md:h-auto md:w-52">
          <img src={cover.thumbnail_url || cover.url} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="min-w-0 flex-1 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="min-w-0 truncate text-xl font-bold text-ink">{booking.guest_name}</h1>
          <BookingStatusBadge status={booking.status} />
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
          <span>{flat}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {guests}{children}
          </span>
          <span aria-hidden="true">·</span>
          <span>{t(`bookings.sources.${booking.source}`)}</span>
        </p>
        {booking.overbooking && (
          <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
            {t('bookings.overbooking.detail')}
          </p>
        )}
        {/* The dates are changed where they are shown: the "Booking" card leaves them out here. */}
        {editableBlocks(booking.status).includes('dates') ? (
          <button
            type="button"
            onClick={() => setEditingDates(true)}
            // A short name: the dates inside read "Check-in", which the check-in step also is.
            aria-label={`${t('common.edit')}: ${t('bookings.editBlock.dates')}`}
            className="group -mx-3 block w-[calc(100%+1.5rem)] rounded-xl px-3 text-left transition-colors hover:bg-surface-page"
          >
            <StayRoute booking={booking} editable />
          </button>
        ) : (
          <StayRoute booking={booking} />
        )}
        <BookingEditSheet booking={booking} block={editingDates ? 'dates' : null} onClose={() => setEditingDates(false)} />
        <BookingActions booking={booking} money={money} deposits={deposits} />
      </div>
    </section>
  )
}

function StayRoute({ booking, editable = false }: { booking: Booking; editable?: boolean }) {
  const { t, i18n } = useTranslation()
  const [now] = useState(() => Date.now())
  const from = new Date(booking.check_in)
  const to = new Date(booking.check_out)
  const hourly = booking.rental_mode === 'hourly'
  const length = hourly
    ? t('bookings.hours', { count: Math.ceil((to.getTime() - from.getTime()) / 3_600_000) })
    : t('bookings.nights', { count: differenceInCalendarDays(to, from) })
  const staying = booking.status === 'checked_in'
  const progress = Math.min(1, Math.max(0, (now - from.getTime()) / (to.getTime() - from.getTime())))
  const waiting = booking.status === 'pending' || booking.status === 'confirmed'
  const daysLeft = differenceInCalendarDays(from, now)
  const arrives =
    !waiting || daysLeft < 0
      ? null
      : daysLeft === 0
        ? t('bookings.arrivesToday')
        : daysLeft === 1
          ? t('bookings.arrivesTomorrow')
          : t('bookings.arrivesIn', { count: daysLeft })

  const boundary = (date: Date, label: string, end: boolean) => (
    <div className={`shrink-0 ${end ? 'text-right' : ''}`}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-lg font-bold text-ink sm:text-2xl">
        {format(date, i18n.language === 'en' ? 'MMM d' : 'd MMM', { locale: dateLocale(i18n.language) })}
      </p>
      <p className="text-xs text-ink-muted">
        {format(date, 'EEEEEE, HH:mm', { locale: dateLocale(i18n.language) })}
      </p>
    </div>
  )

  return (
    <div className="my-5 flex items-center gap-3 sm:gap-5">
      {boundary(from, t('properties.checkIn'), false)}
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 flex items-center justify-center gap-1.5 text-xs font-bold text-ink">
          {length}
          {editable && <Pencil className="h-3 w-3 text-ink-muted transition-colors group-hover:text-accent-ink" aria-hidden="true" />}
        </p>
        {staying ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-accent-soft">
            <div className="h-full rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
          </div>
        ) : (
          <div className="border-t border-dashed border-line" aria-hidden="true" />
        )}
        {arrives && <p className="mt-1.5 text-center text-xs text-ink-muted">{arrives}</p>}
      </div>
      {boundary(to, t('properties.checkOut'), true)}
    </div>
  )
}
