import { createFileRoute } from '@tanstack/react-router'
import PropertyListPage from '../../pages/properties/PropertyListPage'

export const Route = createFileRoute('/properties/')({
  component: PropertyListPage,
})
