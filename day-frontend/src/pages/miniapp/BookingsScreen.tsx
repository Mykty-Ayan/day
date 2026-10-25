/**
 * Every booking, not only the next two weeks: find a guest by name or phone,
 * look back at who stayed, see what was cancelled, or see two weeks flat by
 * flat. The card opens on a tap, the same card Today opens.
 */

import { useEffect, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { listBookings } from '../../api/bookings'
import { listAllProperties } from '../../api/properties'
import type { Booking } from '../../types/booking'
import { formatDay, formatMoney } from './format'
import { ActionButton, BookingRow, Chip, Section } from './miniapp-ui'
import OccupancyList from './OccupancyList'
import { owed } from './money'
import { owes, readAllPages, segmentFilters, segmentItems, UPCOMING_WINDOW_DAYS, type BookingSegment } from './tabs'

const SEARCH_DELAY_MS = 300

export default function BookingsScreen({
  enabled,
  today,
  onOpen,
  onOpenId,
}: {
  enabled: boolean
  today: Date
  onOpen: (booking: Booking) => void
  /** The chart's rows are not whole bookings: the card reads this one first. */
  onOpenId: (bookingId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [view, setView] = useState<BookingSegment | 'occupancy'>('upcoming')
  const segment: BookingSegment = view === 'occupancy' ? 'upcoming' : view
  const [propertyId, setPropertyId] = useState('')
  const [typed, setTyped] = useState('')
  const [search, setSearch] = useState('')
  const [unpaidOnly, setUnpaidOnly] = useState(false)

  // A request per keystroke would race; the last one typed is the one that counts.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(typed), SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [typed])

  // The same cache entry as the flats tab.
  const flats = useQuery({
    queryKey: ['miniapp', 'units'],
    queryFn: () => listAllProperties(),
    enabled,
  })

  const upcoming = useQuery({
    // Its own key: the paged lists below cache pages under theirs, never in this shape.
    queryKey: ['miniapp', 'bookings', 'window', search, propertyId],
    queryFn: () => readAllPages((page) => listBookings(segmentFilters('upcoming', today, search, page, propertyId))),
    enabled: enabled && view === 'upcoming',
  })

  const paged = useInfiniteQuery({
    queryKey: ['miniapp', 'bookings', 'paged', segment, search, propertyId],
    queryFn: ({ pageParam }) => listBookings(segmentFilters(segment, today, search, pageParam, propertyId)),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    enabled: enabled && view !== 'upcoming' && view !== 'occupancy',
  })

  const loaded = segment === 'upcoming' ? (upcoming.data ?? []) : (paged.data?.pages.flatMap((page) => page.items) ?? [])
  const items = segmentItems(segment, loaded, new Date(), unpaidOnly)
  const isLoading = segment === 'upcoming' ? upcoming.isLoading : paged.isLoading
  const isError = segment === 'upcoming' ? upcoming.isError : paged.isError

  const views = (
    <>
      <select
        aria-label={t('miniapp.bookings.flat')}
        value={propertyId}
        onChange={(event) => setPropertyId(event.target.value)}
        className="tg-surface min-h-[44px] w-full rounded-xl px-3 text-sm outline-none"
      >
        <option value="">{t('miniapp.bookings.allFlats')}</option>
        {(flats.data?.items ?? [])
          .filter((flat) => flat.status !== 'archived')
          .map((flat) => (
            <option key={flat.id} value={flat.id}>
              {flat.name || flat.internal_name}
            </option>
          ))}
      </select>
      <div className="flex gap-1">
        {(['upcoming', 'past', 'cancelled', 'occupancy'] as const).map((value) => (
          <Chip key={value} label={t(`miniapp.bookings.${value}`)} active={view === value} onClick={() => setView(value)} />
        ))}
      </div>
    </>
  )

  if (view === 'occupancy') {
    return (
      <div className="space-y-3">
        {views}
        <OccupancyList enabled={enabled} today={today} propertyId={propertyId} onOpen={onOpenId} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {views}
      <label className="tg-surface flex min-h-[44px] items-center gap-2 rounded-xl px-3">
        <Search className="tg-hint h-4 w-4 shrink-0" />
        <input
          type="search"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={t('miniapp.bookings.search')}
          className="w-full bg-transparent text-sm outline-none"
        />
      </label>
      {segment !== 'cancelled' && (
        <div className="flex">
          <Chip label={t('miniapp.bookings.unpaid')} active={unpaidOnly} onClick={() => setUnpaidOnly((on) => !on)} />
        </div>
      )}

      {isLoading && <p className="tg-hint text-sm">{t('miniapp.loading')}</p>}
      {isError && <p className="text-sm">{t('miniapp.loadFailed')}</p>}

      {!isLoading && !isError && (
        <Section title={t(`miniapp.bookings.${segment}`)} count={items.length} emptyLabel={t('miniapp.empty')}>
          {items.map((item) => (
            <BookingRow
              key={item.id}
              booking={item}
              meta={`${formatDay(item.check_in, i18n.language)} → ${formatDay(item.check_out, i18n.language)}`}
              onOpen={() => onOpen(item)}
              extra={
                owes(item) && item.status !== 'cancelled' ? (
                  <span className="shrink-0 text-xs font-bold text-red-500 tabular-nums">
                    {formatMoney(owed(item), i18n.language)} ₸
                  </span>
                ) : undefined
              }
            />
          ))}
        </Section>
      )}

      {segment === 'upcoming' && upcoming.data && !search.trim() && (
        <p className="tg-hint px-1 text-xs">{t('miniapp.bookings.window', { days: UPCOMING_WINDOW_DAYS })}</p>
      )}
      {segment !== 'upcoming' && paged.hasNextPage && (
        <ActionButton disabled={paged.isFetchingNextPage} onClick={() => paged.fetchNextPage()}>
          {paged.isFetchingNextPage ? t('miniapp.loading') : t('miniapp.bookings.more')}
        </ActionButton>
      )}
    </div>
  )
}
