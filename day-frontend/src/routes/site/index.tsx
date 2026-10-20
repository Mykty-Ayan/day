import { createFileRoute } from '@tanstack/react-router'
import SitePage from '../../pages/site/SitePage'

export const Route = createFileRoute('/site/')({
  component: SitePage,
})
