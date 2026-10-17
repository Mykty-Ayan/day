import { createFileRoute } from '@tanstack/react-router'
import PublicOfferPage from '../../pages/public/PublicOfferPage'

/** A guest's personal link from aidyn: flats for the guest's dates, with no sign-in. */
export const Route = createFileRoute('/o/$code')({
  component: function PublicOfferRoute() {
    const { code } = Route.useParams()
    return <PublicOfferPage code={code} />
  },
})
