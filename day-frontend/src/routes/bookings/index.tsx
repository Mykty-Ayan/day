import { createFileRoute } from '@tanstack/react-router'
import BookingListPage from '../../pages/bookings/BookingListPage'

export const Route = createFileRoute('/bookings/')({
  component: BookingListPage,
})
