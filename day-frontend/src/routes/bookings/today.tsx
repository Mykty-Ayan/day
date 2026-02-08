import { createFileRoute } from '@tanstack/react-router'
import TodayPage from '../../pages/bookings/TodayPage'

export const Route = createFileRoute('/bookings/today')({
  component: TodayPage,
})
