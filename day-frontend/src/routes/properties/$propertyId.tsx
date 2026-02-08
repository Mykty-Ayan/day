import { createFileRoute } from '@tanstack/react-router'
import PropertyDetailPage from '../../pages/properties/PropertyDetailPage'

export const Route = createFileRoute('/properties/$propertyId' as never)({
  component: PropertyDetailPage,
})
