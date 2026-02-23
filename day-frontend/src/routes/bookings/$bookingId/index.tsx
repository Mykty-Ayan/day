import { createFileRoute } from '@tanstack/react-router'
import BookingDetailPage from '../../../pages/bookings/BookingDetailPage'

export const Route = createFileRoute('/bookings/$bookingId/')({
  component: BookingDetailPage,
})
