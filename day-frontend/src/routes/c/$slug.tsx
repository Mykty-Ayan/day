import { createFileRoute } from '@tanstack/react-router'
import PublicCompanyPage from '../../pages/public/PublicCompanyPage'

/** A company's page for guests: its flats, its rules, how to reach it. */
export const Route = createFileRoute('/c/$slug')({
  component: function PublicCompanyRoute() {
    const { slug } = Route.useParams()
    return <PublicCompanyPage slug={slug} />
  },
})
