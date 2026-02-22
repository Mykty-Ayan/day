import { createFileRoute } from '@tanstack/react-router'
import EditPropertyPage from '../../../pages/properties/EditPropertyPage'

export const Route = createFileRoute('/properties/$propertyId/edit')({
  component: EditPropertyPage,
})
