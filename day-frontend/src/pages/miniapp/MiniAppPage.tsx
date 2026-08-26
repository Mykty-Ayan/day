/**
 * The operator's phone.
 *
 * Three screens, ordered by how often a subtenant reaches for them: the day
 * ahead, selling a free night, and the reference card for a flat. Every row is
 * a tap target that ends in an action — the previous version could only be read.
 */

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  CalendarCheck,
  DoorOpen,
  KeyRound,
  LogIn,
  LogOut,
  Send,
  SprayCan,
  Users,
  Wifi,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getTodayChecks, listBookings } from '../../api/bookings'
import { getAvailability, telegramMiniAppLogin, type AvailableProperty } from '../../api/miniapp'
import { listAllProperties } from '../../api/properties'
import { copyText, getInitData, initTelegram, isInsideTelegram, tapFeedback } from '../../lib/telegram'
import type { Booking } from '../../types/booking'
import type { Property } from '../../types/property'
import BookSheet from './BookSheet'
import BookingSheet from './BookingSheet'
import CleaningSheet from './CleaningSheet'
import OfferSheet from './OfferSheet'
import { addDays, formatDay, formatMoney, formatTime, toISODate } from './format'
import { ActionButton, Chip, Screen, Section } from './miniapp-ui'

type Tab = 'today' | 'sell' | 'units'
type Period = 'tonight' | 'tomorrow' | 'weekend'

const UPCOMING_DAYS = 14

function weekendRange(today: Date): [Date, Date] {
  const daysUntilFriday = (5 - today.getDay() + 7) % 7
  const friday = addDays(today, daysUntilFriday)
  return [friday, addDays(friday, 2)]
}

function periodRange(period: Period, today: Date): [Date, Date] {
  if (period === 'tomorrow') return [addDays(today, 1), addDays(today, 2)]
  if (period === 'weekend') return weekendRange(today)
  return [today, addDays(today, 1)]
}

export default function MiniAppPage() {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<Tab>('today')
  const [period, setPeriod] = useState<Period>('tonight')
  const [authState, setAuthState] = useState<'pending' | 'ready' | 'failed'>('pending')
  const [authError, setAuthError] = useState('')

  const [offerOpen, setOfferOpen] = useState(false)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [unitToBook, setUnitToBook] = useState<AvailableProperty | null>(null)
  const [cleaningFor, setCleaningFor] = useState<Booking | null>(null)

  const today = useMemo(() => new Date(), [])

  useEffect(() => {
    initTelegram()

    // No login screen: Telegram vouches for the user and the linked chat decides
    // which company they see.
    async function authenticate() {
      if (!isInsideTelegram()) {
        setAuthState('failed')
        setAuthError(t('miniapp.openInTelegram'))
        return
      }
      try {
        const tokens = await telegramMiniAppLogin(getInitData())
        localStorage.setItem('access_token', tokens.access_token)
        localStorage.setItem('refresh_token', tokens.refresh_token)
        setAuthState('ready')
      } catch (error) {
        const detail = (error as { response?: { data?: { detail?: string } } }).response?.data
          ?.detail
        setAuthState('failed')
        setAuthError(detail || t('miniapp.authFailed'))
      }
    }

    authenticate()
  }, [t])

  const enabled = authState === 'ready'

  const todayQuery = useQuery({
    queryKey: ['miniapp', 'today'],
    queryFn: getTodayChecks,
    enabled: enabled && tab === 'today',
  })

  const upcomingQuery = useQuery({
    queryKey: ['miniapp', 'upcoming'],
    queryFn: () =>
      listBookings({
        date_from: toISODate(today),
        date_to: toISODate(addDays(today, UPCOMING_DAYS)),
        per_page: 50,
      }),
    enabled: enabled && tab === 'today',
  })

  const [checkIn, checkOut] = periodRange(period, today)
  const availabilityQuery = useQuery({
    queryKey: ['miniapp', 'availability', period],
    queryFn: () =>
      getAvailability(`${toISODate(checkIn)}T14:00:00`, `${toISODate(checkOut)}T12:00:00`),
    enabled: enabled && tab === 'sell',
  })

  const unitsQuery = useQuery({
    queryKey: ['miniapp', 'units'],
    queryFn: () => listAllProperties(),
    enabled: enabled && tab === 'units',
  })

  if (authState === 'pending') {
    return (
      <Screen>
        <p className="tg-hint text-sm">{t('miniapp.loading')}</p>
      </Screen>
    )
  }

  if (authState === 'failed') {
    return (
      <Screen>
        <KeyRound className="mb-3 h-8 w-8 opacity-40" />
        <p className="text-sm">{authError}</p>
        <p className="tg-hint mt-2 text-xs">{t('miniapp.connectHint')}</p>
      </Screen>
    )
  }

  const upcoming = (upcomingQuery.data?.items ?? [])
    .filter((item) => item.status !== 'cancelled')
    .sort((a, b) => a.check_in.localeCompare(b.check_in))

  return (
    <div className="tg-root min-h-screen pb-6">
      <nav className="tg-surface sticky top-0 z-10 flex gap-1 p-2">
        {(
          [
            ['today', t('miniapp.tabs.today')],
            ['sell', t('miniapp.tabs.sell')],
            ['units', t('miniapp.tabs.flats')],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <Chip key={value} label={label} active={tab === value} onClick={() => setTab(value)} />
        ))}
      </nav>

      <main className="space-y-4 p-3">
        {tab === 'today' && (
          <>
            <ActionButton tone="primary" onClick={() => setOfferOpen(true)}>
              <Send className="h-4 w-4" />
              {t('miniapp.offer.title')}
            </ActionButton>

            {todayQuery.isLoading && <p className="tg-hint text-sm">{t('miniapp.loading')}</p>}
            {todayQuery.isError && <p className="text-sm">{t('miniapp.loadFailed')}</p>}

            {todayQuery.data && (
              <>
                <Section
                  icon={<LogIn className="h-4 w-4" />}
                  title={t('miniapp.arrivals')}
                  count={todayQuery.data.check_ins.length}
                  emptyLabel={t('miniapp.empty')}
                >
                  {todayQuery.data.check_ins.map((item) => (
                    <BookingRow
                      key={item.id}
                      booking={item}
                      meta={formatTime(item.check_in, i18n.language)}
                      onOpen={() => setBooking(item)}
                    />
                  ))}
                </Section>

                <Section
                  icon={<LogOut className="h-4 w-4" />}
                  title={t('miniapp.departures')}
                  count={todayQuery.data.check_outs.length}
                  emptyLabel={t('miniapp.empty')}
                >
                  {todayQuery.data.check_outs.map((item) => (
                    <BookingRow
                      key={item.id}
                      booking={item}
                      meta={formatTime(item.check_out, i18n.language)}
                      onOpen={() => setBooking(item)}
                      extra={
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            tapFeedback()
                            setCleaningFor(item)
                          }}
                          className="tg-surface flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold"
                        >
                          <SprayCan className="h-3.5 w-3.5" />
                          {t('miniapp.cleaning.short')}
                        </button>
                      }
                    />
                  ))}
                </Section>

                <Section
                  icon={<Users className="h-4 w-4" />}
                  title={t('miniapp.inHouse')}
                  count={todayQuery.data.in_house.length}
                  emptyLabel={t('miniapp.empty')}
                >
                  {todayQuery.data.in_house.map((item) => (
                    <BookingRow
                      key={item.id}
                      booking={item}
                      meta={`${t('miniapp.until')} ${formatDay(item.check_out, i18n.language)}`}
                      onOpen={() => setBooking(item)}
                    />
                  ))}
                </Section>
              </>
            )}

            <Section
              icon={<CalendarCheck className="h-4 w-4" />}
              title={t('miniapp.upcoming', { days: UPCOMING_DAYS })}
              count={upcoming.length}
              emptyLabel={t('miniapp.empty')}
            >
              {upcoming.map((item) => (
                <BookingRow
                  key={item.id}
                  booking={item}
                  meta={`${formatDay(item.check_in, i18n.language)} → ${formatDay(item.check_out, i18n.language)}`}
                  onOpen={() => setBooking(item)}
                />
              ))}
            </Section>
          </>
        )}

        {tab === 'sell' && (
          <>
            <div className="flex gap-1">
              <Chip
                label={t('miniapp.periods.tonight')}
                active={period === 'tonight'}
                onClick={() => setPeriod('tonight')}
              />
              <Chip
                label={t('miniapp.periods.tomorrow')}
                active={period === 'tomorrow'}
                onClick={() => setPeriod('tomorrow')}
              />
              <Chip
                label={t('miniapp.periods.weekend')}
                active={period === 'weekend'}
                onClick={() => setPeriod('weekend')}
              />
            </div>

            <p className="tg-hint text-xs">
              {formatDay(checkIn.toISOString(), i18n.language)} —{' '}
              {formatDay(checkOut.toISOString(), i18n.language)}
            </p>

            <ActionButton onClick={() => setOfferOpen(true)}>
              <Send className="h-4 w-4" />
              {t('miniapp.offer.title')}
            </ActionButton>

            {availabilityQuery.isLoading && <p className="tg-hint text-sm">{t('miniapp.loading')}</p>}
            {availabilityQuery.isError && <p className="text-sm">{t('miniapp.loadFailed')}</p>}

            {availabilityQuery.data && (
              <Section
                icon={<DoorOpen className="h-4 w-4" />}
                title={t('miniapp.freeProperties')}
                count={availabilityQuery.data.items.length}
                emptyLabel={t('miniapp.offer.nothingFree')}
              >
                {availabilityQuery.data.items.map((item) => (
                  <button
                    key={item.property_id}
                    type="button"
                    onClick={() => {
                      tapFeedback()
                      setUnitToBook(item)
                    }}
                    className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{item.name}</span>
                      <span className="tg-hint block truncate text-xs">{item.internal_name}</span>
                    </span>
                    <span className="shrink-0 text-xs font-bold">
                      {item.total_price !== null
                        ? `${formatMoney(item.total_price, i18n.language)} ₸`
                        : t('miniapp.noPrice')}
                    </span>
                  </button>
                ))}
              </Section>
            )}
          </>
        )}

        {tab === 'units' && (
          <>
            {unitsQuery.isLoading && <p className="tg-hint text-sm">{t('miniapp.loading')}</p>}
            {unitsQuery.isError && <p className="text-sm">{t('miniapp.loadFailed')}</p>}
            {unitsQuery.data && (
              <Section
                icon={<Building2 className="h-4 w-4" />}
                title={t('miniapp.flats')}
                count={unitsQuery.data.items.length}
                emptyLabel={t('miniapp.empty')}
              >
                {unitsQuery.data.items.map((property) => (
                  <UnitRow key={property.id} property={property} />
                ))}
              </Section>
            )}
          </>
        )}
      </main>

      <OfferSheet key={offerOpen ? 'open' : 'closed'} open={offerOpen} onClose={() => setOfferOpen(false)} />
      <BookingSheet key={booking?.id ?? 'none'} booking={booking} onClose={() => setBooking(null)} />
      <CleaningSheet key={cleaningFor?.id ?? 'none'} booking={cleaningFor} onClose={() => setCleaningFor(null)} />
      <BookSheet
        key={unitToBook?.property_id ?? 'none'}
        unit={unitToBook}
        checkIn={`${toISODate(checkIn)}T14:00:00`}
        checkOut={`${toISODate(checkOut)}T12:00:00`}
        onClose={() => setUnitToBook(null)}
      />
    </div>
  )
}

function BookingRow({
  booking,
  meta,
  onOpen,
  extra,
}: {
  booking: Booking
  meta: string
  onOpen: () => void
  extra?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 pr-3">
      <button
        type="button"
        onClick={() => {
          tapFeedback()
          onOpen()
        }}
        className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {booking.property_name || '—'}
          </span>
          <span className="tg-hint block truncate text-xs">{booking.guest_name || '—'}</span>
        </span>
        <span className="shrink-0 text-xs font-semibold">{meta}</span>
      </button>
      {extra}
    </div>
  )
}

function UnitRow({ property }: { property: Property }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const credentials = [property.wifi_name, property.wifi_password].filter(Boolean).join(' / ')
  const location = [
    property.address_full,
    property.floor ? `${property.floor} ${t('miniapp.floor')}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="px-3 py-2.5">
      <p className="truncate text-sm font-semibold">{property.name || property.internal_name}</p>
      {location && <p className="tg-hint truncate text-xs">{location}</p>}
      <button
        type="button"
        disabled={!credentials}
        onClick={async () => {
          if (!credentials) return
          tapFeedback()
          const ok = await copyText(credentials)
          setCopied(ok)
          window.setTimeout(() => setCopied(false), 1500)
        }}
        className="tg-surface mt-1.5 flex min-h-[36px] w-full items-center gap-2 rounded-lg px-2 text-left text-xs disabled:opacity-50"
      >
        <Wifi className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate font-semibold">{credentials || t('miniapp.noWifi')}</span>
        {copied && <span className="tg-hint shrink-0">{t('miniapp.copied')}</span>}
      </button>
    </div>
  )
}
