/**
 * Booking a free unit while the guest is still on the phone.
 *
 * The phone comes first: it finds a guest who stayed before and asks the
 * colleagues' blacklist before anything is saved. Dates, hours and the number
 * of guests come from "Sell"; the price is quoted for exactly that.
 */

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { calculatePrice, createBooking, listGuests, voidBookingKey } from '../../api/bookings'
import { SessionChangedError } from '../../api/client'
import { checkBlacklist, type AvailableProperty } from '../../api/miniapp'
import { phoneDigits } from '../../lib/phone'
import { confirmAction, resultFeedback } from '../../lib/telegram'
import type { Booking, BookingSource } from '../../types/booking'
import {
  companyFromToken,
  latestBookingCall,
  loadBookingAttempt,
  saveBookingAttempt,
  startBooking,
  storedBookingAttempt,
  withBookingLock,
  type BookingAttempt,
} from './book-attempt'
import { afterFailure, nextCall } from './booking-card'
import { errorText } from './errors'
import { formatDay, formatMoney, formatTime } from './format'
import { ActionButton, Chip, Field, Sheet } from './miniapp-ui'
import type { SellRange } from './sell'
import { useClosingConfirmation } from './useClosingConfirmation'

const SOURCES: BookingSource[] = ['direct', 'airbnb', 'booking', 'other']
const HOLD_HOURS = 2

function phoneStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export default function BookSheet({
  unit,
  range,
  onClose,
  onBooked,
}: {
  unit: AvailableProperty | null
  range: SellRange | null
  onClose: () => void
  onBooked: (booking: Booking) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const queryClient = useQueryClient()
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [source, setSource] = useState<BookingSource>('direct')
  const [hold, setHold] = useState(false)
  const [error, setError] = useState('')
  // A booking sent but not answered, kept on the phone: closing the sheet must
  // not let the guest be booked into a second flat. A retry sends the same body
  // under the same key; until then no other booking starts, whichever flat.
  const [company] = useState(() => companyFromToken(phoneStorage()?.getItem('access_token') ?? null) ?? 'unknown')
  const [pending, setPendingState] = useState<BookingAttempt | null>(() =>
    loadBookingAttempt(phoneStorage(), company),
  )
  function setPending(next: BookingAttempt | null): boolean {
    const kept = saveBookingAttempt(phoneStorage(), company, next)
    setPendingState(next)
    return kept
  }
  // Whether the session is still this company's. A chat relinked meanwhile signs
  // in to another one: asking the server then would answer for that company, and
  // "not made there" would drop a booking that may exist here.
  // The company every write of this sheet is pinned to: the client refuses to
  // send it under another company's token (SessionChangedError).
  const pinned = company === 'unknown' ? undefined : company
  function sameSession(): boolean {
    return companyFromToken(phoneStorage()?.getItem('access_token') ?? null) === company
  }
  function inThisCompany<T>(read: () => Promise<T>): () => Promise<T> {
    return () => (sameSession() ? read() : Promise.reject(new Error('The session is another company now')))
  }
  // Whether an answer is about the attempt on the phone now. A late answer to an
  // earlier one (the sheet was closed and reopened meanwhile) must not settle a newer one.
  function isCurrent(sent: BookingAttempt): boolean {
    return loadBookingAttempt(phoneStorage(), company)?.key === sent.key
  }
  // An attempt whose answer was lost, being settled on the server.
  const [verifying, setVerifying] = useState(false)
  // From the press until the request is out (the blacklist check takes a moment).
  const [checking, setChecking] = useState(false)
  const pressed = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useClosingConfirmation(Boolean(unit) && Boolean(name.trim() || phone.trim()))

  const open = Boolean(unit && range)
  const digits = phoneDigits(phone)
  const lookup = open && digits.length >= 11

  const known = useQuery({
    // Per company: a chat relinked to another one must not see this one's guests.
    queryKey: ['miniapp', 'guest', company, digits],
    queryFn: inThisCompany(() => listGuests({ phone: digits })),
    enabled: lookup,
    staleTime: 60_000,
  })
  const warning = useQuery({
    queryKey: ['miniapp', 'blacklist', company, digits],
    queryFn: inThisCompany(() => checkBlacklist(digits)),
    enabled: lookup,
    staleTime: 60_000,
  })
  const guest = known.data?.items[0]

  // The form resets by being remounted: the parent keys this component on the
  // unit, so picking another flat starts from a clean sheet.
  const quote = useQuery({
    queryKey: ['miniapp', 'quote', unit?.property_id, range],
    queryFn: () =>
      calculatePrice({
        property_id: unit!.property_id,
        check_in: range!.checkIn,
        check_out: range!.checkOut,
        adults_count: range!.guests,
        children_count: 0,
        rental_mode: range!.rentalMode,
      }),
    enabled: open,
  })

  // The server books an existing guest under the name already on file.
  const guestName = name.trim() || guest?.name || ''

  const book = useMutation({
    mutationFn: (sent: BookingAttempt) => createBooking(sent.body, sent.key, pinned),
    // Every read and write of the attempt below runs under the windows' shared lock.
    onSuccess: (created, sent) => {
      queryClient.invalidateQueries({ queryKey: ['miniapp'] })
      void withBookingLock(company, () => {
        if (!isCurrent(sent)) return
        setPending(null)
        resultFeedback('success')
        onBooked(created)
      })
    },
    onError: (mutationError, sent) => {
      // Not sent at all: the session is another company's. The attempt stays as it was.
      if (mutationError instanceof SessionChangedError) return setError(t('miniapp.book.otherCompany'))
      void withBookingLock(company, () => {
        // Only the latest send of the attempt on the phone: an earlier send's late
        // refusal says nothing about a retry whose answer was lost.
        const stored = storedBookingAttempt(phoneStorage(), company)
        if (!latestBookingCall(stored, sent)) return
        resultFeedback('error')
        // A refusal of the first call means nothing was made; otherwise only the same request may follow.
        const left = afterFailure(stored, mutationError)
        setPending(left)
        if (!left) {
          setError(errorText(mutationError, t('miniapp.book.failed'), t))
          return
        }
        // The booking may exist already: the lists must show it before anyone books this guest again.
        queryClient.invalidateQueries({ queryKey: ['miniapp'] })
        setError(t('miniapp.book.maybeMade'))
      })
    },
  })

  async function askBook() {
    // A second tap before the first one's check returns must not book twice.
    if (pressed.current || pending) return
    if (!sameSession()) return setError(t('miniapp.book.otherCompany'))
    pressed.current = true
    setChecking(true)
    setError('')
    // The form as it is now, hold time included; the fields lock until the request is out.
    const attempt: BookingAttempt = {
      unit: unit!.name,
      key: crypto.randomUUID(),
      call: 1,
      body: {
        property_id: unit!.property_id,
        guest_name: guestName,
        guest_phone: phone.trim(),
        check_in: range!.checkIn,
        check_out: range!.checkOut,
        rental_mode: range!.rentalMode,
        source,
        adults_count: range!.guests,
        children_count: 0,
        expires_at: hold ? new Date(Date.now() + HOLD_HOURS * 3_600_000).toISOString() : undefined,
      },
    }
    try {
      const outcome = await startBooking(attempt, {
        digits,
        check: (number) =>
          queryClient.fetchQuery({
            queryKey: ['miniapp', 'blacklist', company, number],
            queryFn: inThisCompany(() => checkBlacklist(number)),
            staleTime: 60_000,
          }),
        confirmWarned: () => confirmAction(t('miniapp.book.warnedAsk')),
        isOpen: () => alive.current,
        // Kept only if no other window kept one meanwhile, as one step under the lock.
        claim: (kept) =>
          withBookingLock(company, () => {
            if (!alive.current) return 'closed' as const
            if (loadBookingAttempt(phoneStorage(), company)) return 'busy' as const
            if (!saveBookingAttempt(phoneStorage(), company, kept)) return 'notKept' as const
            setPendingState(kept)
            return 'kept' as const
          }),
        send: (kept) => book.mutate(kept),
      })
      if (outcome === 'busy') {
        // Another window booked meanwhile: its attempt is settled first.
        setPendingState(loadBookingAttempt(phoneStorage(), company))
        resultFeedback('error')
        return
      }
      if (outcome === 'checkFailed' || outcome === 'notKept') {
        resultFeedback('error')
        setError(t(outcome === 'checkFailed' ? 'miniapp.book.checkFailed' : 'miniapp.book.notKept'))
      }
    } finally {
      pressed.current = false
      if (alive.current) setChecking(false)
    }
  }

  // A retry is the same body under the same key, numbered and kept before it goes out.
  async function retry(stale: BookingAttempt) {
    if (!sameSession()) return setError(t('miniapp.book.otherCompany'))
    const call = await withBookingLock(company, () => {
      const stored = storedBookingAttempt(phoneStorage(), company)
      // Another window settled it or started another: show what is on the phone now.
      if (stored?.key !== stale.key) {
        setPendingState(loadBookingAttempt(phoneStorage(), company))
        return null
      }
      const next = nextCall({ ...stored, uncertain: stored.uncertain || stale.uncertain })
      return setPending(next) ? next : 'notKept'
    })
    if (call === 'notKept') {
      resultFeedback('error')
      setError(t('miniapp.book.notKept'))
      return
    }
    if (call) book.mutate(call)
  }

  // Settles an attempt whose answer was lost, on the server: the key is voided
  // under its lock, so either it made the booking, or it never will, even if
  // the first send is still on its way. No list search, no guess.
  async function checkAttempt(stale: BookingAttempt) {
    if (!sameSession()) return setError(t('miniapp.book.otherCompany'))
    setVerifying(true)
    try {
      const outcome = await voidBookingKey(stale.key, pinned)
      // Settled: gone from the phone, unless another sheet or window already cleared it.
      await withBookingLock(company, () => {
        if (isCurrent(stale)) setPending(null)
        else setPendingState(loadBookingAttempt(phoneStorage(), company))
      })
      queryClient.invalidateQueries({ queryKey: ['miniapp'] })
      if (outcome.booking) {
        setError('')
        resultFeedback('success')
        onBooked(outcome.booking)
        return
      }
      setError(t('miniapp.book.notMade', { unit: stale.unit, guest: stale.body.guest_name }))
    } catch (checkError) {
      resultFeedback('error')
      if (checkError instanceof SessionChangedError) return setError(t('miniapp.book.otherCompany'))
      setError(errorText(checkError, t('miniapp.loadFailed'), t))
    } finally {
      if (alive.current) setVerifying(false)
    }
  }

  if (!unit || !range) return null

  // The flat's own hours, as availability reports them; the slot itself for hours.
  // Nothing in the form changes from the press until an answer settles it.
  const locked = checking || book.isPending || pending !== null

  const from = unit.check_in ?? range.checkIn
  const to = unit.check_out ?? range.checkOut
  const when = (value: string) =>
    value.length > 10 ? `${formatDay(value, lang)} ${formatTime(value, lang)}` : formatDay(`${value}T12:00:00`, lang)

  return (
    <Sheet open title={unit.name} onClose={onClose}>
      {pending && (
        <div role="alert" className="tg-surface space-y-2 rounded-xl px-3 py-3">
          <p className="text-sm">{t('miniapp.book.pending', { unit: pending.unit, guest: pending.body.guest_name })}</p>
          <ActionButton tone="primary" disabled={book.isPending || verifying} onClick={() => retry(pending)}>
            <CalendarCheck className="h-4 w-4" />
            {book.isPending ? t('miniapp.book.saving') : t('miniapp.book.retry')}
          </ActionButton>
          <ActionButton disabled={book.isPending || verifying} onClick={() => checkAttempt(pending)}>
            {verifying ? t('miniapp.loading') : t('miniapp.book.check')}
          </ActionButton>
        </div>
      )}

      <div className="tg-surface rounded-xl px-3 py-3">
        <div className="flex items-baseline justify-between">
          <span className="tg-hint text-xs font-bold uppercase tracking-wide">{t('miniapp.book.total')}</span>
          <span className="text-lg font-bold">
            {quote.data ? `${formatMoney(quote.data.total, lang)} ₸` : quote.isError ? t('miniapp.noPrice') : '…'}
          </span>
        </div>
        <p className="tg-hint mt-1 text-xs">
          {when(from)} → {when(to)} · {t('miniapp.book.guests', { count: range.guests })}
        </p>
      </div>

      <Field
        label={t('miniapp.book.guestPhone')}
        value={phone}
        onChange={setPhone}
        disabled={locked}
        type="tel"
        inputMode="tel"
        placeholder="+7 701 000 00 00"
      />

      {warning.data?.warned && (
        <p role="alert" className="flex gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {warning.data.message}
        </p>
      )}

      {guest && (
        <p className="tg-surface rounded-xl px-3 py-2 text-xs">
          {t('miniapp.book.known', { name: guest.name })}
        </p>
      )}

      <Field
        label={t('miniapp.book.guestName')}
        value={name}
        onChange={setName}
        disabled={locked}
        placeholder={guest?.name || t('miniapp.book.namePlaceholder')}
      />

      <div>
        <p className="tg-hint mb-1 text-xs font-bold uppercase tracking-wide">{t('miniapp.book.source')}</p>
        <div className="flex gap-1">
          {SOURCES.map((value) => (
            <Chip
              key={value}
              label={t(`bookings.sources.${value}`)}
              active={source === value}
              onClick={() => !locked && setSource(value)}
            />
          ))}
        </div>
      </div>

      <label className="tg-surface flex items-start gap-3 rounded-xl px-3 py-3 text-sm">
        <input
          type="checkbox"
          checked={hold}
          disabled={locked}
          onChange={(event) => setHold(event.target.checked)}
          className="mt-1"
        />
        <span>
          {t('miniapp.book.hold', { count: HOLD_HOURS })}
          <span className="tg-hint block text-xs">{t('miniapp.book.holdHint', { count: HOLD_HOURS })}</span>
        </span>
      </label>

      {error && (
        <p role="alert" className="text-sm font-semibold">
          {error}
        </p>
      )}

      {!pending && (
        <ActionButton tone="primary" disabled={!guestName || locked} onClick={askBook}>
          <CalendarCheck className="h-4 w-4" />
          {locked ? t('miniapp.book.saving') : t('miniapp.book.confirm')}
        </ActionButton>
      )}
    </Sheet>
  )
}
