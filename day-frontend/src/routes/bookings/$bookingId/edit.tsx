import { createFileRoute, redirect } from '@tanstack/react-router'

// The booking is edited block by block on its own screen; old links land there.
export const Route = createFileRoute('/bookings/$bookingId/edit')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/bookings/$bookingId', params, replace: true })
  },
})
