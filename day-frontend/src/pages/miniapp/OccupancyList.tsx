/**
 * The next two weeks flat by flat, for a phone held upright: a strip of nights
 * per flat and the stays under it. Not the web chart — no sideways scrolling,
 * one flat after another.
 */

import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getGanttData } from '../../api/bookings'
import { tapFeedback } from '../../lib/telegram'
import { addDays, formatDay, intlLocale, toISODate } from './format'
import { Section } from './miniapp-ui'
import { occupancy, OCCUPANCY_DAYS, type NightState } from './occupancy'

const NIGHT_TONE: Record<NightState, string> = {
  booked: 'tg-active',
  closed: 'bg-black/40 text-white',
  free: 'tg-root border border-black/10',
}

export default function OccupancyList({
  enabled,
  today,
  propertyId,
  onOpen,
}: {
  enabled: boolean
  today: Date
  propertyId: string
  onOpen: (bookingId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const from = toISODate(today)
  const to = toISODate(addDays(today, OCCUPANCY_DAYS))

  const chart = useQuery({
    queryKey: ['miniapp', 'occupancy', from, to],
    queryFn: () => getGanttData(from, to),
    enabled,
  })

  if (chart.isLoading) return <p className="tg-hint text-sm">{t('miniapp.loading')}</p>
  if (chart.isError || !chart.data) return <p className="text-sm">{t('miniapp.loadFailed')}</p>

  const flats = occupancy(chart.data.properties, today).filter((flat) => !propertyId || flat.id === propertyId)
  const weekday = (date: string) =>
    new Date(`${date}T12:00:00`).toLocaleDateString(intlLocale(i18n.language), { weekday: 'narrow' })

  return (
    <div className="space-y-3">
      <p className="tg-hint flex gap-3 px-1 text-xs">
        {(['free', 'booked', 'closed'] as NightState[]).map((state) => (
          <span key={state} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-3 rounded-sm ${NIGHT_TONE[state]}`} />
            {t(`miniapp.occupancy.${state}`)}
          </span>
        ))}
      </p>
      {flats.length === 0 && <p className="tg-hint text-sm">{t('miniapp.empty')}</p>}
      {flats.map((flat) => (
        <Section
          key={flat.id}
          title={flat.name}
          action={<span className="tg-hint text-xs">{t('miniapp.occupancy.freeNights', { count: flat.free })}</span>}
        >
          <ol aria-label={flat.name} className="grid grid-cols-7 gap-1 px-3 pb-3">
            {flat.nights.map((night) => (
              <li
                key={night.date}
                aria-label={`${formatDay(`${night.date}T12:00:00`, i18n.language)}: ${t(`miniapp.occupancy.${night.state}`)}`}
                className={`flex h-10 flex-col items-center justify-center rounded-md text-[10px] leading-tight ${NIGHT_TONE[night.state]}`}
              >
                <span className="opacity-70">{weekday(night.date)}</span>
                <span className="font-bold tabular-nums">{Number(night.date.slice(8))}</span>
              </li>
            ))}
          </ol>
          {flat.bookings.map((booking) => (
            <button
              key={booking.id}
              type="button"
              onClick={() => {
                tapFeedback()
                onOpen(booking.id)
              }}
              className="flex min-h-[44px] w-full items-center gap-3 px-3 py-2 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{booking.guest_name || '—'}</span>
              <span className="shrink-0 text-xs font-semibold">
                {formatDay(booking.check_in, i18n.language)} → {formatDay(booking.check_out, i18n.language)}
              </span>
            </button>
          ))}
        </Section>
      ))}
    </div>
  )
}
