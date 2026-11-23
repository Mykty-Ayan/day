import { useQuery } from '@tanstack/react-query'
import { calculatePrice } from '../api/bookings'
import { nextDay, nightShare, nightsOf } from '../lib/stay-dates'
import type { Booking } from '../types/booking'

type Stay = Pick<
  Booking,
  'id' | 'property_id' | 'check_in' | 'check_out' | 'rental_mode' | 'total_price' | 'calculated_price' | 'adults_count' | 'children_count'
>

/** What the first night of a stay by the night costs: the flat's price for that night,
 *  or, for a price set by hand, its share for one night. Null for hours or a single night. */
export function useFirstNight(booking: Stay | null): number | null {
  const nights = booking ? nightsOf(booking.check_in, booking.check_out) : 0
  const byNight = !!booking && booking.rental_mode !== 'hourly' && nights > 1
  const handPriced = !!booking && Number(booking.total_price) !== Number(booking.calculated_price)
  const quote = useQuery({
    // Everything the price depends on: a guest added on an open card reprices the night.
    queryKey: [
      'first-night',
      booking?.id,
      booking?.property_id,
      booking?.check_in,
      booking?.rental_mode,
      booking?.adults_count,
      booking?.children_count,
    ],
    enabled: byNight && !handPriced,
    staleTime: 60_000,
    queryFn: () =>
      calculatePrice({
        property_id: booking!.property_id,
        check_in: booking!.check_in,
        check_out: nextDay(booking!.check_in),
        adults_count: booking!.adults_count,
        children_count: booking!.children_count,
        rental_mode: booking!.rental_mode,
      }),
  })
  if (!byNight) return null
  if (handPriced) return nightShare(Number(booking!.total_price), nights)
  return quote.data ? Number(quote.data.total) : null
}
