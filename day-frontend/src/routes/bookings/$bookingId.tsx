import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/bookings/$bookingId')({
  component: BookingLayoutRoute,
})

function BookingLayoutRoute() {
  return <Outlet />
}
