import { createFileRoute } from '@tanstack/react-router'
import PublicStayPage from '../../pages/public/PublicStayPage'

/** A flat's page for guests: opened by its link, with no sign-in. */
export const Route = createFileRoute('/s/$code')({
  component: function PublicStayRoute() {
    const { code } = Route.useParams()
    return <PublicStayPage code={code} />
  },
})
