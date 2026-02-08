import { createFileRoute } from '@tanstack/react-router'
import CreatePropertyPage from '../../pages/properties/CreatePropertyPage'

export const Route = createFileRoute('/properties/new')({
  component: CreatePropertyPage,
})
