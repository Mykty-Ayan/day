import { createFileRoute } from '@tanstack/react-router'
import CreateBookingPage from '../../pages/bookings/CreateBookingPage'

export const Route = createFileRoute('/bookings/new' as never)({
  component: CreateBookingPage,
})
