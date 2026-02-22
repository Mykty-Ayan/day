import { createFileRoute } from '@tanstack/react-router'
import CleanerTaskDetailPage from '../../pages/cleaner/CleanerTaskDetailPage'

export const Route = createFileRoute('/cleaner/$taskId')({
  component: CleanerTaskDetailPage,
})
