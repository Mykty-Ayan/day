import { createFileRoute } from '@tanstack/react-router'
import CreateCleaningTaskPage from '../../pages/cleaning/CreateCleaningTaskPage'

export const Route = createFileRoute('/cleaning/new')({
  component: CreateCleaningTaskPage,
})
