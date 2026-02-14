import { createFileRoute } from '@tanstack/react-router'
import AnalyticsDashboardPage from '../../pages/analytics/AnalyticsDashboardPage'

export const Route = createFileRoute('/analytics/')({
  component: AnalyticsDashboardPage,
})
