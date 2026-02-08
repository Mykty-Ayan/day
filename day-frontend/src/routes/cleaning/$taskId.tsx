import { createFileRoute } from '@tanstack/react-router'
import CleaningDetailPage from '../../pages/cleaning/CleaningDetailPage'

export const Route = createFileRoute('/cleaning/$taskId')({
  component: CleaningDetailPage,
})
