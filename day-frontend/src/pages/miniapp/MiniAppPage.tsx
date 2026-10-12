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
  KeyRound,
  LogIn,
  LogOut,
  Send,
  SprayCan,
  Users,
  Wifi,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getBooking, getTodayChecks, listBookings } from '../../api/bookings'
import { storeSession } from '../../api/client'
import { telegramMiniAppLogin, type AvailableProperty } from '../../api/miniapp'
import { listAllProperties } from '../../api/properties'
import { copyText, getInitData, initTelegram, isInsideTelegram, tapFeedback } from '../../lib/telegram'
import type { Booking } from '../../types/booking'
import type { Property } from '../../types/property'
import AskScreen from './AskScreen'
import BookSheet from './BookSheet'
import BookingSheet from './BookingSheet'
import CleaningSheet from './CleaningSheet'
import OfferSheet from './OfferSheet'
import SellScreen from './SellScreen'
import UnitSheet from './UnitSheet'
import type { SellRange } from './sell'
import { linkedBookingId } from './card-state'
import { errorText } from './errors'
import { addDays, formatDay, formatMoney, formatTime, toISODate } from './format'
import { ActionButton, Chip, Screen, Section } from './miniapp-ui'

type Tab = 'today' | 'sell' | 'units' | 'ask'
const UPCOMING_DAYS = 14

export default function MiniAppPage() {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<Tab>('today')
  const [authState, setAuthState] = useState<'pending' | 'ready' | 'failed'>('pending')
  const [authError, setAuthError] = useState('')
  const [attempt, setAttempt] = useState(0)

  const [offerOpen, setOfferOpen] = useState(false)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [toBook, setToBook] = useState<{ unit: AvailableProperty; range: SellRange } | null>(null)
  const [cleaningFor, setCleaningFor] = useState<Booking | null>(null)
  const [unitId, setUnitId] = useState<string | null>(null)
  // A bot notice's "Open booking" button lands here with ?booking=<id>.
  const [linkedId, setLinkedId] = useState(() => linkedBookingId(window.location.search))

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
        storeSession(await telegramMiniAppLogin(getInitData()))
        setAuthState('ready')
      } catch (error) {
        setAuthState('failed')
        setAuthError(errorText(error, t('miniapp.authFailed'), t))
      }
    }

    authenticate()
  }, [t, attempt])

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

  const linked = useQuery({
    queryKey: ['miniapp', 'booking', linkedId],
    queryFn: () => getBooking(linkedId!),
    enabled: enabled && Boolean(linkedId),
    retry: false,
  })
  const opened = booking ?? (linkedId ? (linked.data?.booking ?? null) : null)

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
        {isInsideTelegram() && (
          <div className="mt-4 w-full max-w-xs">
            <ActionButton
              onClick={() => {
                setAuthState('pending')
                setAttempt((value) => value + 1)
              }}
            >
              {t('miniapp.retry')}
            </ActionButton>
          </div>
        )}
      </Screen>
    )
  }

  // An archived flat is not sold or cleaned any more; it only clutters the list.
  const workingUnits = (unitsQuery.data?.items ?? []).filter((property) => property.status !== 'archived')

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
            ['ask', t('miniapp.tabs.ask')],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <Chip key={value} label={label} active={tab === value} onClick={() => setTab(value)} />
        ))}
      </nav>

      <main className="space-y-4 p-3">
        {tab === 'today' && (
          <>
            {linkedId && linked.isError && (
              <button
                type="button"
                role="alert"
                onClick={() => setLinkedId(null)}
                className="tg-surface w-full rounded-xl px-3 py-2 text-left text-sm"
              >
                {errorText(linked.error, t('miniapp.linkedFailed'), t)}
                <span className="tg-hint block text-xs">{t('miniapp.tapToHide')}</span>
              </button>
            )}

            <MoneyStrip bookings={upcoming} />

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
          <SellScreen
            enabled={enabled}
            today={today}
            onOffer={() => setOfferOpen(true)}
            onPick={(unit, range) => setToBook({ unit, range })}
          />
        )}

        {tab === 'units' && (
          <>
            {unitsQuery.isLoading && <p className="tg-hint text-sm">{t('miniapp.loading')}</p>}
            {unitsQuery.isError && <p className="text-sm">{t('miniapp.loadFailed')}</p>}
            {unitsQuery.data && (
              <Section
                icon={<Building2 className="h-4 w-4" />}
                title={t('miniapp.flats')}
                count={workingUnits.length}
                emptyLabel={t('miniapp.empty')}
              >
                {workingUnits.map((property) => (
                  <UnitRow key={property.id} property={property} onOpen={() => setUnitId(property.id)} />
                ))}
              </Section>
            )}
          </>
        )}

        {tab === 'ask' && <AskScreen />}
      </main>

      <OfferSheet key={offerOpen ? 'open' : 'closed'} open={offerOpen} onClose={() => setOfferOpen(false)} />
      <BookingSheet
        key={opened?.id ?? 'none'}
        booking={opened}
        onClose={() => {
          setBooking(null)
          setLinkedId(null)
        }}
      />
      <CleaningSheet key={cleaningFor?.id ?? 'none'} booking={cleaningFor} onClose={() => setCleaningFor(null)} />
      <UnitSheet key={unitId ?? 'none'} unitId={unitId} onClose={() => setUnitId(null)} />
      <BookSheet
        key={toBook ? `${toBook.unit.property_id}-${toBook.range.checkIn}-${toBook.range.checkOut}` : 'none'}
        unit={toBook?.unit ?? null}
        range={toBook?.range ?? null}
        onClose={() => setToBook(null)}
        onBooked={(created) => {
          // Straight to the new booking: the prepayment is the next thing to take.
          setToBook(null)
          setBooking(created)
        }}
      />
    </div>
  )
}

/** Two figures the operator checks last thing at night, read straight off the
 *  list that is already loaded — no extra request, no separate screen. */
function MoneyStrip({ bookings }: { bookings: Booking[] }) {
  const { t, i18n } = useTranslation()

  const owed = bookings.reduce(
    (sum, booking) => sum + Math.max(0, booking.total_price - (booking.paid_amount ?? 0)),
    0,
  )
  const booked = bookings.reduce((sum, booking) => sum + booking.total_price, 0)

  return (
    <div className="tg-surface grid grid-cols-2 gap-px overflow-hidden rounded-xl">
      <Figure label={t('miniapp.money.owed')} value={`${formatMoney(owed, i18n.language)} ₸`} />
      <Figure label={t('miniapp.money.booked')} value={`${formatMoney(booked, i18n.language)} ₸`} />
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5">
      <p className="tg-hint text-xs font-bold uppercase tracking-wide">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
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

function UnitRow({ property, onOpen }: { property: Property; onOpen: () => void }) {
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
      <button
        type="button"
        onClick={() => {
          tapFeedback()
          onOpen()
        }}
        className="block w-full text-left"
      >
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{property.name || property.internal_name}</span>
          {property.status !== 'active' && (
            <span className="tg-root shrink-0 rounded px-1.5 text-[10px] font-bold">{t(`miniapp.unit.status.${property.status}`)}</span>
          )}
        </span>
        <span className="tg-hint block truncate text-xs">
          {[property.internal_name, location].filter(Boolean).join(' · ')}
        </span>
      </button>
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
