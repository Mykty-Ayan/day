import { createFileRoute } from '@tanstack/react-router'
import CleanerDashboardPage from '../../pages/cleaner/CleanerDashboardPage'

export const Route = createFileRoute('/cleaner/')({
  component: CleanerDashboardPage,
})
