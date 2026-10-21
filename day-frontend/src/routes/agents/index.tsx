import { createFileRoute } from '@tanstack/react-router'
import AgentsPage from '../../pages/agents/AgentsPage'

export const Route = createFileRoute('/agents/')({
  component: AgentsPage,
})
