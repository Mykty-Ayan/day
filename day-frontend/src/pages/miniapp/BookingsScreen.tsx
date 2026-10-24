/**
 * Every booking, not only the next two weeks: find a guest by name or phone,
 * look back at who stayed, see what was cancelled. The card opens on a tap,
 * the same card Today opens.
 */

import { useEffect, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { listBookings } from '../../api/bookings'
import type { Booking } from '../../types/booking'
import { formatDay, formatMoney } from './format'
import { ActionButton, BookingRow, Chip, Section } from './miniapp-ui'
import { owes, segmentFilters, segmentItems, UPCOMING_WINDOW_DAYS, type BookingSegment } from './tabs'

const SEARCH_DELAY_MS = 300

export default function BookingsScreen({
  enabled,
  today,
  onOpen,
}: {
  enabled: boolean
  today: Date
  onOpen: (booking: Booking) => void
}) {
  const { t, i18n } = useTranslation()
  const [segment, setSegment] = useState<BookingSegment>('upcoming')
  const [typed, setTyped] = useState('')
  const [search, setSearch] = useState('')
  const [unpaidOnly, setUnpaidOnly] = useState(false)

  // A request per keystroke would race; the last one typed is the one that counts.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(typed), SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [typed])

  const upcoming = useQuery({
    queryKey: ['miniapp', 'bookings', 'upcoming', search],
    queryFn: () => listBookings(segmentFilters('upcoming', today, search)),
    enabled: enabled && segment === 'upcoming',
  })

  const paged = useInfiniteQuery({
    queryKey: ['miniapp', 'bookings', segment, search],
    queryFn: ({ pageParam }) => listBookings(segmentFilters(segment, today, search, pageParam)),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    enabled: enabled && segment !== 'upcoming',
  })

  const loaded = segment === 'upcoming' ? (upcoming.data?.items ?? []) : (paged.data?.pages.flatMap((page) => page.items) ?? [])
  const items = segmentItems(segment, loaded, new Date(), unpaidOnly)
  const isLoading = segment === 'upcoming' ? upcoming.isLoading : paged.isLoading
  const isError = segment === 'upcoming' ? upcoming.isError : paged.isError

  return (
    <div className="space-y-3">
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

      <div className="flex gap-1">
        {(['upcoming', 'past', 'cancelled'] as BookingSegment[]).map((value) => (
          <Chip
            key={value}
            label={t(`miniapp.bookings.${value}`)}
            active={segment === value}
            onClick={() => setSegment(value)}
          />
        ))}
      </div>
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
                    {formatMoney(item.total_price - (item.paid_amount ?? 0), i18n.language)} ₸
                  </span>
                ) : undefined
              }
            />
          ))}
        </Section>
      )}

      {segment === 'upcoming' && upcoming.data && (
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
