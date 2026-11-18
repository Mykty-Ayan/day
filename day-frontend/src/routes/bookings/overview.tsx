import { createFileRoute } from '@tanstack/react-router'
import BookingsOverviewPage from '../../pages/bookings/BookingsOverviewPage'

export const Route = createFileRoute('/bookings/overview')({
  component: BookingsOverviewPage,
})
