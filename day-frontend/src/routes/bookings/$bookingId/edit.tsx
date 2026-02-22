import { createFileRoute } from '@tanstack/react-router'
import EditBookingPage from '../../../pages/bookings/EditBookingPage'

export const Route = createFileRoute('/bookings/$bookingId/edit')({
  component: EditBookingPage,
})
