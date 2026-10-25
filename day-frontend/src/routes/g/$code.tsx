import { createFileRoute } from '@tanstack/react-router'
import GuestPanelPage from '../../pages/public/GuestPanelPage'

/** A guest's own page for their booking: opened by its link, with no sign-in. */
export const Route = createFileRoute('/g/$code')({
  component: function GuestPanelRoute() {
    const { code } = Route.useParams()
    return <GuestPanelPage code={code} />
  },
})
