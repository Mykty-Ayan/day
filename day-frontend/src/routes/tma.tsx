import { createFileRoute } from '@tanstack/react-router'
import MiniAppCrash from '../pages/miniapp/MiniAppCrash'
import MiniAppPage from '../pages/miniapp/MiniAppPage'

export const Route = createFileRoute('/tma')({
  component: MiniAppPage,
  errorComponent: MiniAppCrash,
})
