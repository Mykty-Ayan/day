import { createFileRoute } from '@tanstack/react-router'
import ReadinessPage from '../../pages/readiness/ReadinessPage'

export const Route = createFileRoute('/readiness/')({
  component: ReadinessPage,
})
