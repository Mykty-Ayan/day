import { createFileRoute, redirect } from '@tanstack/react-router'

// The root has no page of its own: a signed-in user lands on today's
// check-ins/check-outs, the screen they open first every morning.
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/bookings/today' })
  },
})
