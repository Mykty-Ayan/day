import { createFileRoute } from '@tanstack/react-router'
import GanttChartPage from '../../pages/properties/GanttChartPage'

export const Route = createFileRoute('/properties/gantt')({
  component: GanttChartPage,
})
