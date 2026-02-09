import { createFileRoute } from '@tanstack/react-router'
import ChecklistTemplatesPage from '../../pages/cleaning/ChecklistTemplatesPage'

export const Route = createFileRoute('/cleaning/checklists')({
  component: ChecklistTemplatesPage,
})
