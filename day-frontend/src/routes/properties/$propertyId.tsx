import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/properties/$propertyId')({
  component: PropertyLayoutRoute,
})

function PropertyLayoutRoute() {
  return <Outlet />
}
