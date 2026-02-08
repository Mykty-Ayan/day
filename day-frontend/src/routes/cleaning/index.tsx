import { createFileRoute } from '@tanstack/react-router'
import CleaningListPage from '../../pages/cleaning/CleaningListPage'

export const Route = createFileRoute('/cleaning/')({
  component: CleaningListPage,
})
