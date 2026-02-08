import { createFileRoute } from '@tanstack/react-router'
import CreateBookingPage from '../../pages/bookings/CreateBookingPage'

export const Route = createFileRoute('/bookings/new')({
  component: CreateBookingPage,
})
