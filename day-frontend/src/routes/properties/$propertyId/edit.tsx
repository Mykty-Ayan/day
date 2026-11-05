import { createFileRoute, redirect } from '@tanstack/react-router'

// The flat is changed in place now, from its page; the old address leads there.
export const Route = createFileRoute('/properties/$propertyId/edit')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/properties/$propertyId', params, replace: true })
  },
})
