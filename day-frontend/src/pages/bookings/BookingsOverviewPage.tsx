import { useTranslation } from 'react-i18next'
import BookingsDashboard from '../../components/booking/BookingsDashboard'

/** The bookings' month at a glance; the list of every booking is its own tab. */
export default function BookingsOverviewPage() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
      <h1 className="mb-4 text-xl font-bold text-ink">{t('bookings.overview.title')}</h1>
      <BookingsDashboard />
    </div>
  )
}
