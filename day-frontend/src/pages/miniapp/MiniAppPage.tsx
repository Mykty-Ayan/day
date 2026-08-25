import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarCheck, DoorOpen, KeyRound, LogIn, LogOut, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getTodayChecks, listBookings } from '../../api/bookings'
import { getAvailability, telegramMiniAppLogin } from '../../api/miniapp'
import { getInitData, initTelegram, isInsideTelegram, tapFeedback } from '../../lib/telegram'
import type { Booking } from '../../types/booking'

type Tab = 'today' | 'free' | 'bookings'
type Period = 'tonight' | 'tomorrow' | 'weekend'

const UPCOMING_DAYS = 14

function toISODate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate(),
  ).padStart(2, '0')}`
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

/** Friday to Sunday of the current week, or the coming one once the weekend has passed. */
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

function formatDay(value: string, language: string): string {
  return new Date(value).toLocaleDateString(language, { day: '2-digit', month: 'short' })
}

function formatTime(value: string, language: string): string {
  return new Date(value).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })
}

function formatMoney(value: number, language: string): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value)
}

export default function MiniAppPage() {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<Tab>('today')
  const [period, setPeriod] = useState<Period>('tonight')
  const [authState, setAuthState] = useState<'pending' | 'ready' | 'failed'>('pending')
  const [authError, setAuthError] = useState('')

  const today = useMemo(() => new Date(), [])

  useEffect(() => {
    initTelegram()

    // The Mini App has no login screen: Telegram vouches for the user and the
    // linked chat decides which company they see.
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

  const [checkIn, checkOut] = periodRange(period, today)
  const availabilityQuery = useQuery({
    queryKey: ['miniapp', 'availability', period],
    queryFn: () => getAvailability(`${toISODate(checkIn)}T14:00:00`, `${toISODate(checkOut)}T12:00:00`),
    enabled: enabled && tab === 'free',
  })

  const bookingsQuery = useQuery({
    queryKey: ['miniapp', 'bookings'],
    queryFn: () =>
      listBookings({
        date_from: toISODate(today),
        date_to: toISODate(addDays(today, UPCOMING_DAYS)),
        per_page: 50,
      }),
    enabled: enabled && tab === 'bookings',
  })

  if (authState === 'pending') {
    return <Screen><p className="tg-hint text-sm">{t('miniapp.loading')}</p></Screen>
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

  const upcoming = (bookingsQuery.data?.items ?? [])
    .filter((booking) => booking.status !== 'cancelled')
    .sort((a, b) => a.check_in.localeCompare(b.check_in))

  return (
    <div className="tg-root min-h-screen pb-6">
      <nav className="tg-surface sticky top-0 z-10 flex gap-1 p-2">
        {(
          [
            ['today', t('miniapp.tabs.today')],
            ['free', t('miniapp.tabs.free')],
            ['bookings', t('miniapp.tabs.bookings')],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              tapFeedback()
              setTab(value)
            }}
            className={`min-h-[44px] flex-1 rounded-lg px-3 text-sm font-semibold transition-colors ${
              tab === value ? 'tg-active' : 'tg-hint'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="space-y-4 p-3">
        {tab === 'today' && (
          <>
            {todayQuery.isLoading && <p className="tg-hint text-sm">{t('miniapp.loading')}</p>}
            {todayQuery.isError && <p className="text-sm">{t('miniapp.loadFailed')}</p>}
            {todayQuery.data && (
              <>
                <Group
                  icon={<LogIn className="h-4 w-4" />}
                  title={t('miniapp.arrivals')}
                  count={todayQuery.data.check_ins.length}
                >
                  {todayQuery.data.check_ins.map((booking) => (
                    <Row
                      key={booking.id}
                      title={booking.property_name || '—'}
                      subtitle={booking.guest_name || '—'}
                      meta={formatTime(booking.check_in, i18n.language)}
                    />
                  ))}
                </Group>

                <Group
                  icon={<Users className="h-4 w-4" />}
                  title={t('miniapp.inHouse')}
                  count={todayQuery.data.in_house.length}
                >
                  {todayQuery.data.in_house.map((booking) => (
                    <Row
                      key={booking.id}
                      title={booking.property_name || '—'}
                      subtitle={booking.guest_name || '—'}
                      meta={`${t('miniapp.until')} ${formatDay(booking.check_out, i18n.language)}`}
                    />
                  ))}
                </Group>

                <Group
                  icon={<LogOut className="h-4 w-4" />}
                  title={t('miniapp.departures')}
                  count={todayQuery.data.check_outs.length}
                >
                  {todayQuery.data.check_outs.map((booking) => (
                    <Row
                      key={booking.id}
                      title={booking.property_name || '—'}
                      subtitle={booking.guest_name || '—'}
                      meta={formatTime(booking.check_out, i18n.language)}
                    />
                  ))}
                </Group>
              </>
            )}
          </>
        )}

        {tab === 'free' && (
          <>
            <div className="flex gap-1">
              {(
                [
                  ['tonight', t('miniapp.periods.tonight')],
                  ['tomorrow', t('miniapp.periods.tomorrow')],
                  ['weekend', t('miniapp.periods.weekend')],
                ] as [Period, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    tapFeedback()
                    setPeriod(value)
                  }}
                  className={`min-h-[44px] flex-1 rounded-lg px-2 text-xs font-semibold ${
                    period === value ? 'tg-active' : 'tg-surface tg-hint'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="tg-hint text-xs">
              {formatDay(checkIn.toISOString(), i18n.language)} —{' '}
              {formatDay(checkOut.toISOString(), i18n.language)}
            </p>

            {availabilityQuery.isLoading && <p className="tg-hint text-sm">{t('miniapp.loading')}</p>}
            {availabilityQuery.isError && <p className="text-sm">{t('miniapp.loadFailed')}</p>}
            {availabilityQuery.data && (
              <Group
                icon={<DoorOpen className="h-4 w-4" />}
                title={t('miniapp.freeProperties')}
                count={availabilityQuery.data.items.length}
              >
                {availabilityQuery.data.items.map((item) => (
                  <Row
                    key={item.property_id}
                    title={item.name}
                    subtitle={item.internal_name}
                    meta={
                      item.total_price !== null
                        ? formatMoney(item.total_price, i18n.language)
                        : t('miniapp.noPrice')
                    }
                  />
                ))}
              </Group>
            )}
          </>
        )}

        {tab === 'bookings' && (
          <>
            {bookingsQuery.isLoading && <p className="tg-hint text-sm">{t('miniapp.loading')}</p>}
            {bookingsQuery.isError && <p className="text-sm">{t('miniapp.loadFailed')}</p>}
            {bookingsQuery.data && (
              <Group
                icon={<CalendarCheck className="h-4 w-4" />}
                title={t('miniapp.upcoming', { days: UPCOMING_DAYS })}
                count={upcoming.length}
              >
                {upcoming.map((booking: Booking) => (
                  <Row
                    key={booking.id}
                    title={booking.property_name || '—'}
                    subtitle={booking.guest_name || '—'}
                    meta={`${formatDay(booking.check_in, i18n.language)} → ${formatDay(
                      booking.check_out,
                      i18n.language,
                    )}`}
                  />
                ))}
              </Group>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="tg-root flex min-h-screen flex-col items-center justify-center px-6 text-center">
      {children}
    </div>
  )
}

function Group({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode
  title: string
  count: number
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <section className="tg-surface overflow-hidden rounded-xl">
      <header className="flex items-center gap-2 px-3 py-2.5">
        {icon}
        <h2 className="flex-1 text-sm font-bold">{title}</h2>
        <span className="tg-hint text-xs font-semibold">{count}</span>
      </header>
      {count === 0 ? (
        <p className="tg-hint px-3 pb-3 text-sm">{t('miniapp.empty')}</p>
      ) : (
        <ul className="tg-divide">{children}</ul>
      )}
    </section>
  )
}

function Row({ title, subtitle, meta }: { title: string; subtitle: string; meta: string }) {
  return (
    <li className="flex min-h-[52px] items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="tg-hint truncate text-xs">{subtitle}</p>
      </div>
      <span className="shrink-0 text-xs font-semibold">{meta}</span>
    </li>
  )
}
