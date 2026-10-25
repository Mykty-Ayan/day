/**
 * The operator's phone.
 *
 * Three screens, ordered by how often a subtenant reaches for them: the day
 * ahead, selling a free night, and the reference card for a flat. Every row is
 * a tap target that ends in an action — the previous version could only be read.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Building2,
  CalendarCheck,
  KeyRound,
  List,
  LogIn,
  LogOut,
  MessageCircle,
  Plus,
  Send,
  ShoppingBag,
  SprayCan,
  Users,
  Wallet,
  Wifi,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getBooking, getTodayChecks, listBookings } from '../../api/bookings'
import { listGuestOrders } from '../../api/guest-orders'
import { onSessionStored, storeSession } from '../../api/client'
import { onIdentityChange, roleFromToken, sessionIdentity } from '../../lib/token'
import { telegramMiniAppLogin, type AvailableProperty } from '../../api/miniapp'
import { listAllProperties } from '../../api/properties'
import { copyText, getInitData, initTelegram, isInsideTelegram, tapFeedback } from '../../lib/telegram'
import type { Booking } from '../../types/booking'
import type { Property } from '../../types/property'
import AskScreen from './AskScreen'
import BookSheet from './BookSheet'
import { attemptSheet, companyFromToken, loadBookingAttempt, phoneStorage } from './book-attempt'
import BookingSheet from './BookingSheet'
import CleanerScreen from './CleanerScreen'
import CleaningSheet from './CleaningSheet'
import OfferSheet from './OfferSheet'
import SellScreen from './SellScreen'
import UnitSheet from './UnitSheet'
import type { SellRange } from './sell'
import { cardRead, linkedBookingId } from './card-state'
import { errorText } from './errors'
import { addDays, formatDay, formatMoney, formatTime, toISODate } from './format'
import { ActionButton, BookingRow, Screen, Section, TabBar } from './miniapp-ui'
import BookingsScreen from './BookingsScreen'
import MoneyScreen from './MoneyScreen'
import OrdersScreen from './OrdersScreen'
import { linkedOrderId } from './orders'
import { searchWithTab, tabFromSearch, type Tab } from './tabs'

const UPCOMING_DAYS = 14

export default function MiniAppPage() {
  const { t, i18n } = useTranslation()
  const [tab, setTabState] = useState<Tab>(() => tabFromSearch(window.location.search))
  // Replaced, not pushed: Telegram's back arrow closes sheets, and a history of
  // tab switches would make the Android back gesture walk through them instead.
  const setTab = (next: Tab) => {
    setTabState(next)
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${searchWithTab(window.location.search, next)}`)
  }
  const [authState, setAuthState] = useState<'pending' | 'ready' | 'failed'>('pending')
  const [authError, setAuthError] = useState('')
  const [attempt, setAttempt] = useState(0)
  // A cleaner's chat gets their own cleanings, never bookings or money.
  const [role, setRole] = useState<string | null>(null)
  // Who the screen was built for. The app signs itself in again when a session
  // cannot be refreshed; if the chat was relinked meanwhile, that is another
  // user, company or role, and nothing on screen or in the cache belongs to it.
  const shownFor = useRef<string | null>(null)
  // Another window signed in to another account: this one stops until a person
  // chooses to continue here (reloading by itself would ping-pong with that window).
  const [paused, setPaused] = useState(false)
  useEffect(
    () =>
      onSessionStored((fromOtherWindow) => {
        const action = onIdentityChange(
          shownFor.current,
          sessionIdentity(localStorage.getItem('access_token')),
          fromOtherWindow,
        )
        if (action === 'reload') window.location.reload()
        if (action === 'pause') setPaused(true)
      }),
    [],
  )

  const [offerOpen, setOfferOpen] = useState(false)
  const [booking, setBooking] = useState<Booking | null>(null)
  const [toBook, setToBook] = useState<{ unit: AvailableProperty; range: SellRange } | null>(null)
  // A booking whose answer was lost, kept on the phone until it is settled. Read on
  // every render of the sell tab: the book sheet saves and clears it.
  const stuck =
    tab === 'sell'
      ? loadBookingAttempt(phoneStorage(), companyFromToken(phoneStorage()?.getItem('access_token') ?? null) ?? 'unknown')
      : null
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
        const session = await telegramMiniAppLogin(getInitData())
        shownFor.current = sessionIdentity(session.access_token)
        storeSession(session)
        setRole(roleFromToken(session.access_token))
        setAuthState('ready')
      } catch (error) {
        setAuthState('failed')
        setAuthError(errorText(error, t('miniapp.authFailed'), t))
      }
    }

    authenticate()
  }, [t, attempt])

  // The booking screens' reads; a cleaner would only get 403s from them.
  const enabled = authState === 'ready' && role !== 'cleaner' && !paused
  // New guests' orders, for the header's badge; the orders screen shares the answer.
  const ordersQuery = useQuery({ queryKey: ['miniapp', 'orders'], queryFn: listGuestOrders, enabled, refetchInterval: 30_000 })
  const newOrders = (ordersQuery.data ?? []).filter((order) => order.status === 'new').length

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
    // The card's own read: the same cache entry, cancelled the same way.
    ...cardRead(['miniapp', 'booking', linkedId], (signal) => getBooking(linkedId!, signal)),
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

  if (paused) {
    return (
      <Screen>
        <KeyRound className="mb-3 h-8 w-8 opacity-40" />
        <p className="text-sm">{t('miniapp.otherSession')}</p>
        <div className="mt-4 w-full max-w-xs">
          <ActionButton
            tone="primary"
            // A fresh page signs this window in again (the other window pauses then)
            // and drops whatever the other account's session left in memory; the
            // chat may even have been relinked meanwhile.
            onClick={() => window.location.reload()}
          >
            {t('miniapp.continueHere')}
          </ActionButton>
        </div>
      </Screen>
    )
  }

  if (role === 'cleaner') return <CleanerScreen />

  // An archived flat is not sold or cleaned any more; it only clutters the list.
  const workingUnits = (unitsQuery.data?.items ?? []).filter((property) => property.status !== 'archived')

  const upcoming = (upcomingQuery.data?.items ?? [])
    .filter((item) => item.status !== 'cancelled')
    .sort((a, b) => a.check_in.localeCompare(b.check_in))

  return (
    <div className="tg-root min-h-screen pb-24">
      <header className="tg-root sticky top-0 z-10 flex items-center gap-2 px-3 pt-3">
        <h1 className="flex-1 truncate text-base font-bold">{t(`miniapp.tabs.${tab === 'units' ? 'flats' : tab}`)}</h1>
        <button
          type="button"
          aria-label={newOrders ? `${t('miniapp.tabs.orders')}: ${newOrders}` : t('miniapp.tabs.orders')}
          aria-current={tab === 'orders' ? 'page' : undefined}
          onClick={() => {
            tapFeedback()
            setTab('orders')
          }}
          className={`flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${tab === 'orders' ? 'tg-active' : 'tg-surface'}`}
        >
          <ShoppingBag className="h-4 w-4" />
          {t('miniapp.tabs.orders')}
          {newOrders > 0 && (
            <span className="rounded-full bg-red-600 px-1.5 text-[11px] leading-5 text-white">{newOrders}</span>
          )}
        </button>
        <button
          type="button"
          aria-label={t('miniapp.tabs.ask')}
          aria-current={tab === 'ask' ? 'page' : undefined}
          onClick={() => {
            tapFeedback()
            setTab('ask')
          }}
          className={`flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${tab === 'ask' ? 'tg-active' : 'tg-surface'}`}
        >
          <MessageCircle className="h-4 w-4" />
          {t('miniapp.tabs.ask')}
        </button>
      </header>
      <main className="space-y-4 p-3">
        {/* A booking opened by its id (a notice, the two-week chart) that could not be read. */}
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

        {tab === 'today' && (
          <>
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
          <>
            {stuck && !toBook && (
              // Here, not only in a flat's sheet: the lost answer may be the booking
              // that took the last free flat, and then no flat is left to open.
              <div role="alert" className="tg-surface space-y-2 rounded-xl px-3 py-3">
                <p className="text-sm">{t('miniapp.book.pending', { unit: stuck.unit, guest: stuck.body.guest_name })}</p>
                <ActionButton tone="primary" onClick={() => setToBook(attemptSheet(stuck))}>
                  {t('miniapp.book.settle')}
                </ActionButton>
              </div>
            )}
            <SellScreen
              enabled={enabled}
              today={today}
              onOffer={() => setOfferOpen(true)}
              onPick={(unit, range) => setToBook({ unit, range })}
            />
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

        {tab === 'bookings' && (
          <BookingsScreen enabled={enabled} today={today} onOpen={setBooking} onOpenId={setLinkedId} />
        )}

        {tab === 'money' && <MoneyScreen enabled={enabled} today={today} onOpen={setBooking} />}

        {tab === 'ask' && <AskScreen />}

        {tab === 'orders' && <OrdersScreen enabled={enabled} linkedId={linkedOrderId(window.location.search)} />}
      </main>

      <TabBar
        active={tab}
        onChange={setTab}
        items={[
          { value: 'today', label: t('miniapp.tabs.today'), icon: <CalendarCheck className="h-5 w-5" /> },
          { value: 'bookings', label: t('miniapp.tabs.bookings'), icon: <List className="h-5 w-5" /> },
          { value: 'sell', label: t('miniapp.tabs.sell'), icon: <Plus className="h-5 w-5" /> },
          { value: 'units', label: t('miniapp.tabs.flats'), icon: <Building2 className="h-5 w-5" /> },
          { value: 'money', label: t('miniapp.tabs.money'), icon: <Wallet className="h-5 w-5" /> },
        ]}
      />

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
    (sum, booking) => sum + Math.max(0, booking.total_price - (booking.paid_amount ?? 0)) + (booking.orders_due ?? 0),
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
