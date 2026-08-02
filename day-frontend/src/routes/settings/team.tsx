import { createFileRoute } from '@tanstack/react-router'
import TeamPage from '../../pages/settings/TeamPage'

export const Route = createFileRoute('/settings/team')({
  component: TeamPage,
})
