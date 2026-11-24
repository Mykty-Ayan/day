import { CarFront, Footprints } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { NearbyPlace } from '../../types/property'

/** What is near the flat and how far, as the owner wrote it: on foot or by car. */
export function NearbyList({ places }: { places: NearbyPlace[] }) {
  const { t } = useTranslation()
  return (
    <ul className="flex flex-col" data-testid="nearby">
      {places.map((place, n) => {
        const Icon = place.by === 'car' ? CarFront : Footprints
        return (
          <li key={`${place.name}-${n}`} className="flex items-center gap-3 border-b border-[#F0F0F3] py-2.5 last:border-0 last:pb-0">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F3F3F6]">
              <Icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span dir="auto" className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">{place.name}</span>
            <span className="shrink-0 text-sm text-[#6B6B74]">
              {t(place.by === 'car' ? 'guest.byCar' : 'guest.onFoot', { minutes: place.minutes })}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
