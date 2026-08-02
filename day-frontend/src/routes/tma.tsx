import { createFileRoute } from '@tanstack/react-router'
import MiniAppPage from '../pages/miniapp/MiniAppPage'

export const Route = createFileRoute('/tma')({
  component: MiniAppPage,
})
