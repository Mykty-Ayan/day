import { createFileRoute } from '@tanstack/react-router'
import BlacklistPage from '../../pages/blacklist/BlacklistPage'

export const Route = createFileRoute('/blacklist/')({
  component: BlacklistPage,
})
