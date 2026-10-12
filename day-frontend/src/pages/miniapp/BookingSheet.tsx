/**
 * Everything an operator does to a live booking, one thumb at a time:
 * check the guest in or out, extend, take money, and hand the guest the address
 * and Wi-Fi without retyping any of it. Money and anything that cannot be
 * undone go through a confirmation first.
 */

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BedDouble, CheckCircle2, Copy, LogIn, LogOut, Phone, Send, Wallet, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  addPayment,
  calculatePrice,
  changeBookingStatus,
  confirmPayment,
  getBooking,
  updateBooking,
  voidPaymentKey,
} from '../../api/bookings'
import { getProperty } from '../../api/properties'
import type { Booking, BookingPayment, BookingStatus, PaymentMethod } from '../../types/booking'
import { confirmAction, copyText, openWhatsApp, resultFeedback } from '../../lib/telegram'
import {
  canCancel,
  extendedCheckOut,
  latestCall,
  loadAttempt,
  afterFailure,
  nextCall,
  phoneDigits,
  receiveOutcome,
  sameAttempt,
  saveAttempt,
  settlement,
  storedAttempt,
  withMoneyLock,
  type MoneyAttempt,
} from './booking-card'
import { cardRead, readyToAct } from './card-state'
import { formatDay, formatMoney, formatTime } from './format'
import DepositRow from './DepositRow'
import { errorText } from './errors'
import { buildCheckInMessage } from './messages'
import { ActionButton, Chip, Field, Sheet } from './miniapp-ui'
import { useClosingConfirmation } from './useClosingConfirmation'

/** The single legal step forward from each status.
 *
 *  The backend refuses to skip a link — pending goes to confirmed, never
 *  straight to checked_in — so offering a fixed "Заселить" button turned into
 *  an error the moment a booking was taken by phone. */
const NEXT_STEP: Partial<
  Record<BookingStatus, { status: BookingStatus; labelKey: string; Icon: typeof LogIn }>
> = {
  pending: { status: 'confirmed', labelKey: 'miniapp.booking.confirm', Icon: CheckCircle2 },
  confirmed: { status: 'checked_in', labelKey: 'miniapp.booking.checkIn', Icon: LogIn },
  checked_in: { status: 'checked_out', labelKey: 'miniapp.booking.checkOut', Icon: LogOut },
  checked_out: { status: 'completed', labelKey: 'miniapp.booking.complete', Icon: CheckCircle2 },
}

const STATUS_KEY: Record<BookingStatus, string> = {
  pending: 'common.pending',
  confirmed: 'common.confirmed',
  checked_in: 'common.checkedIn',
  checked_out: 'common.checkedOut',
  completed: 'common.completed',
  cancelled: 'common.cancelled',
}

const METHODS: PaymentMethod[] = ['transfer', 'cash', 'card']

type PaymentAttempt = Extract<MoneyAttempt, { kind: 'payment' }>
type ReceiveAttempt = Extract<MoneyAttempt, { kind: 'receive' }>

/** localStorage when the browser allows it; the attempt then outlives the card. */
function attemptStorage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function newKey(): string {
  return crypto.randomUUID()
}

export default function BookingSheet({
  booking: opened,
  onClose,
}: {
  booking: Booking | null
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('transfer')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [openedAt] = useState(() => Date.now())
  // A check still out when the card closes must not act on what it reads.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  // A payment whose answer never came: it may be recorded already. Until it is
  // settled by a retry with the same key, no other payment is started.
  // Restored when the card opens: it may have been closed while the call was out.
  const [unsettled, setUnsettledState] = useState<MoneyAttempt | null>(() =>
    opened ? loadAttempt(attemptStorage(), opened.id) : null,
  )
  function setUnsettled(attempt: MoneyAttempt | null): boolean {
    const kept = opened ? saveAttempt(attemptStorage(), opened.id, attempt) : false
    setUnsettledState(attempt)
    return kept
  }
  useClosingConfirmation(Boolean(opened) && amount.trim() !== '')

  // A row from a list is a snapshot: a payment confirms a pending booking, a
  // status change moves it. The card works on the booking as the server has it.
  const fresh = useQuery({
    // Someone else (the CRM, the web) may have moved it since the last look.
    ...cardRead(['miniapp', 'booking', opened?.id], (signal) => getBooking(opened!.id, signal)),
    enabled: Boolean(opened),
  })
  const booking = fresh.data?.booking ?? opened
  // Acting on a booking read before this card opened sends old dates or statuses.
  const settling = !readyToAct(fresh, openedAt)

  const property = useQuery({
    queryKey: ['miniapp', 'property', booking?.property_id],
    queryFn: () => getProperty(booking!.property_id),
    enabled: Boolean(booking),
  })

  // Booking and payments from one answer: a total from one read and payments
  // from another showed debts that were already paid.
  const payments = fresh.data?.payments ?? []
  const { due, waiting } = settlement(booking?.total_price ?? 0, payments)
  const received = payments.filter((payment) => payment.status === 'completed')

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['miniapp'] })
  }

  // Whether an answer is about the attempt on the phone now. A late answer to an
  // earlier one (the card was closed and reopened meanwhile) must not settle a newer one.
  function isCurrent(attempt: MoneyAttempt): boolean {
    return opened ? sameAttempt(loadAttempt(attemptStorage(), opened.id), attempt) : false
  }

  // Whether a failed send may change the attempt: only the latest send of the one
  // on the phone. An earlier send's late refusal says nothing about a lost retry.
  function failedLatest(attempt: MoneyAttempt): MoneyAttempt | null {
    const stored = opened ? storedAttempt(attemptStorage(), opened.id) : null
    return latestCall(stored, attempt) ? stored : null
  }

  // Every read and write of the money attempt runs under a lock the app's windows
  // share: two windows must not each start a payment, or overwrite the other's.
  function underLock<T>(run: () => T): Promise<T> {
    return withMoneyLock(opened?.id ?? '', run)
  }

  // The attempt is settled: gone from the phone unless another one took its place.
  function settled(attempt: MoneyAttempt): Promise<void> {
    return underLock(() => {
      if (isCurrent(attempt)) setUnsettled(null)
      else setUnsettledState(opened ? loadAttempt(attemptStorage(), opened.id) : null)
    })
  }

  const [checking, setChecking] = useState(false)

  function fail(mutationError: unknown) {
    resultFeedback('error')
    setError(errorText(mutationError, t('miniapp.loadFailed'), t))
  }

  function done(close: boolean) {
    resultFeedback('success')
    setError('')
    refresh()
    // A closed card's late answer must not close the card open now.
    if (close && alive.current) onClose()
  }

  const extend = useMutation({
    mutationFn: (checkOut: string) => updateBooking(booking!.id, { check_out: checkOut }),
    onSuccess: () => done(true),
    onError: fail,
  })

  const setStatus = useMutation({
    mutationFn: (status: BookingStatus) => changeBookingStatus(booking!.id, status),
    onSuccess: () => done(true),
    onError: fail,
  })

  const pay = useMutation({
    mutationFn: (attempt: PaymentAttempt) =>
      addPayment(booking!.id, { amount: attempt.amount, type: 'payment', method: attempt.method }, attempt.key),
    onSuccess: (_, attempt) =>
      void underLock(() => {
        if (!isCurrent(attempt)) return refresh()
        setUnsettled(null)
        setAmount('')
        done(false)
      }),
    onError: (mutationError, attempt) =>
      void underLock(() => {
        const stored = failedLatest(attempt)
        if (!stored) return
        // Kept (it was saved before sending) unless the server clearly refused it.
        setUnsettled(afterFailure(stored, mutationError))
        fail(mutationError)
      }),
  })

  const receive = useMutation({
    // Confirming twice is harmless on the server, so a retry is always safe.
    mutationFn: (attempt: ReceiveAttempt) => confirmPayment(booking!.id, attempt.paymentId),
    onSuccess: (_, attempt) =>
      void underLock(() => {
        if (!isCurrent(attempt)) return refresh()
        setUnsettled(null)
        done(false)
      }),
    onError: (mutationError, attempt) =>
      void underLock(() => {
        const stored = failedLatest(attempt)
        if (!stored) return
        setUnsettled(afterFailure(stored, mutationError))
        fail(mutationError)
      }),
  })

  // Money moves one step at a time: until a payment lands and the list is reread,
  // or while an earlier attempt has no known outcome, "Balance" and every money
  // button would work from the old figures.
  const moneyBusy = settling || pay.isPending || receive.isPending || unsettled !== null

  if (!booking) return null

  const next = NEXT_STEP[booking.status]
  const target = extendedCheckOut(booking)
  const hourly = booking.rental_mode === 'hourly'
  const digits = phoneDigits(booking.guest_phone)
  const amountValue = Number(amount)
  const checkInText = buildCheckInMessage(booking, property.data, lang, t)
  const money = (value: number) => `${formatMoney(value, lang)} ₸`
  const when = (value: string) => `${formatDay(value, lang)} ${formatTime(value, lang)}`

  async function askExtend() {
    if (!target || !booking) return
    // The new total first: a night added to a hand-set price is a free night.
    let message = t('miniapp.booking.extendAsk', { until: when(target) })
    if (booking.total_price !== booking.calculated_price) {
      message = t('miniapp.booking.extendManual', { until: when(target) })
    } else {
      try {
        const quote = await calculatePrice({
          property_id: booking.property_id,
          check_in: booking.check_in,
          check_out: target,
          adults_count: booking.adults_count,
          children_count: booking.children_count,
          rental_mode: booking.rental_mode,
        })
        message = t('miniapp.booking.extendPrice', { until: when(target), total: money(quote.total) })
      } catch {
        // No quote is no reason to refuse; the question just says less.
      }
    }
    // Closed while the price was asked: the question must not appear over another card.
    if (!alive.current) return
    if ((await confirmAction(message)) && alive.current) extend.mutate(target)
  }

  async function askCancel() {
    if ((await confirmAction(t('miniapp.booking.cancelAsk'))) && alive.current) setStatus.mutate('cancelled')
  }

  // Each send is numbered and kept before it goes out, under the lock: closing
  // the card mid-request must not lose the key, a late failure of an earlier
  // send must not undo a later one, and another window's attempt is never
  // overwritten — a first send finds none, a retry finds its own.
  async function send(attempt: MoneyAttempt) {
    const call = await underLock(() => {
      const stored = opened ? storedAttempt(attemptStorage(), opened.id) : null
      if (attempt.call ? !sameAttempt(stored, attempt) : stored !== null) {
        // Settled or started in another window: show what is on the phone now.
        setUnsettledState(opened ? loadAttempt(attemptStorage(), opened.id) : null)
        return 'other' as const
      }
      const next = nextCall(stored ? { ...stored, uncertain: stored.uncertain || attempt.uncertain } : attempt)
      if (setUnsettled(next)) return next
      // A first send that cannot be kept is not sent at all.
      if (!attempt.call) setUnsettledState(null)
      return 'notKept' as const
    })
    if (call === 'other') return resultFeedback('error')
    if (call === 'notKept') {
      resultFeedback('error')
      setError(t('miniapp.booking.notKept'))
      return
    }
    if (call.kind === 'payment') pay.mutate(call)
    else receive.mutate(call)
  }

  async function askPay() {
    const methodLabel = t(`miniapp.methods.${method}`)
    if (await confirmAction(t('miniapp.booking.payAsk', { amount: money(amountValue), method: methodLabel }))) {
      if (!alive.current) return
      send({ kind: 'payment', amount: amountValue, method, key: newKey() } satisfies PaymentAttempt)
    }
  }

  // Settles an attempt whose answer was lost, on the server. For a payment the
  // key is voided under its lock: either it recorded the payment, or it never
  // will, even if the first send is still on its way. "Received" has no key:
  // a fresh read settles it only once the payment shows completed.
  async function checkAttempt(attempt: MoneyAttempt) {
    setChecking(true)
    try {
      if (attempt.kind === 'payment') {
        const outcome = await voidPaymentKey(booking!.id, attempt.key)
        await settled(attempt)
        if (!outcome.voided) {
          // Recorded: the amount still in the field must not be paid again.
          setAmount('')
          return done(false)
        }
        // Never recorded: the amount stays in the field to be entered again.
        setError(t('miniapp.booking.notRecorded', { amount: money(attempt.amount) }))
        refresh()
        return
      }
      // The card's own read: cancelled if the card closes, never a stale answer
      // written into the cache as fresh.
      const startedAt = Date.now()
      const read = await fresh.refetch()
      if (!alive.current) return
      if (!read.isSuccess || read.dataUpdatedAt < startedAt) return fail(read.error)
      const outcome = receiveOutcome(read.data.payments.find((item) => item.id === attempt.paymentId))
      // Still pending: the lost confirm may land yet, so only a retry may follow.
      if (outcome === 'waiting') return setError(t('miniapp.booking.notReceived', { amount: money(attempt.amount) }))
      await settled(attempt)
      if (outcome === 'received') return done(false)
      setError(t('miniapp.booking.receiveGone', { amount: money(attempt.amount) }))
    } catch (checkError) {
      fail(checkError)
    } finally {
      setChecking(false)
    }
  }

  async function askReceive(payment: BookingPayment) {
    if (await confirmAction(t('miniapp.booking.receivedAsk', { amount: money(payment.amount) }))) {
      if (!alive.current) return
      send({ kind: 'receive', paymentId: payment.id, amount: payment.amount } satisfies ReceiveAttempt)
    }
  }

  return (
    <Sheet open title={booking.guest_name || booking.property_name || ''} onClose={onClose}>
      {booking.overbooking && (
        <p role="alert" className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white">
          {t('bookings.overbooking.detail')}
        </p>
      )}

      <div className="tg-surface rounded-xl px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{booking.property_name}</p>
          <span className="tg-root rounded-md px-2 py-0.5 text-[11px] font-bold">{t(STATUS_KEY[booking.status])}</span>
        </div>
        <p className="tg-hint mt-1 text-xs">
          {when(booking.check_in)} → {when(booking.check_out)}
        </p>
        {booking.guest_phone && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="flex-1">{booking.guest_phone}</span>
            {digits && (
              <a
                href={`tel:+${digits}`}
                aria-label={t('miniapp.booking.call')}
                className="tg-root flex h-9 w-9 items-center justify-center rounded-full"
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
          </div>
        )}
        <p className="mt-2 flex items-baseline justify-between text-sm">
          <span className="tg-hint">{t('miniapp.booking.due')}</span>
          <span className="font-bold">
            {money(due)}
            <span className="tg-hint font-normal"> / {money(booking.total_price)}</span>
          </span>
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold">
          {error}
        </p>
      )}

      {fresh.isError && !fresh.isFetching && (
        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
          <p className="text-sm">{t('miniapp.booking.stale')}</p>
          <ActionButton onClick={() => fresh.refetch()}>{t('miniapp.retry')}</ActionButton>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {target && (
          <ActionButton disabled={settling || extend.isPending} onClick={askExtend}>
            <BedDouble className="h-4 w-4" />
            {t(hourly ? 'miniapp.booking.extendHour' : 'miniapp.booking.extend')}
          </ActionButton>
        )}
        {next && (
          <ActionButton disabled={settling || setStatus.isPending} onClick={() => setStatus.mutate(next.status)}>
            <next.Icon className="h-4 w-4" />
            {t(next.labelKey)}
          </ActionButton>
        )}
      </div>

      {(due > 0 || waiting.length > 0 || received.length > 0 || unsettled) && (
        <div className="tg-surface space-y-3 rounded-xl p-3">
          <p className="text-sm font-semibold">{t('miniapp.booking.money')}</p>

          {received.map((payment) => (
            <p key={payment.id} className="flex justify-between text-xs">
              <span className="tg-hint">
                {formatDay(payment.paid_at || payment.created_at, lang)} · {t(`miniapp.methods.${payment.method}`)}
              </span>
              <span>{money(payment.type === 'refund' ? -payment.amount : payment.amount)}</span>
            </p>
          ))}

          {waiting.map((payment) => (
            <div key={payment.id} className="flex items-center justify-between gap-2 text-xs">
              <span>
                {t('miniapp.booking.waiting')}: {money(payment.amount)}
              </span>
              <button
                type="button"
                disabled={moneyBusy}
                onClick={() => askReceive(payment)}
                className="tg-active rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-40"
              >
                {t('miniapp.booking.received')}
              </button>
            </div>
          ))}

          {unsettled && (
            <div className="space-y-2">
              <p className="text-xs">
                {t(unsettled.kind === 'payment' ? 'miniapp.booking.unsettled' : 'miniapp.booking.unsettledReceive', {
                  amount: money(unsettled.amount),
                })}
              </p>
              <ActionButton
                tone="primary"
                disabled={settling || checking || pay.isPending || receive.isPending}
                onClick={() => send(unsettled)}
              >
                <Wallet className="h-4 w-4" />
                {t('miniapp.booking.retryPayment', { amount: money(unsettled.amount) })}
              </ActionButton>
              <ActionButton
                disabled={checking || pay.isPending || receive.isPending}
                onClick={() => checkAttempt(unsettled)}
              >
                {checking ? t('miniapp.loading') : t('miniapp.booking.checkAttempt')}
              </ActionButton>
            </div>
          )}

          {due > 0 && !unsettled && (
            <>
              <div className="flex gap-1">
                {METHODS.map((value) => (
                  <Chip
                    key={value}
                    label={t(`miniapp.methods.${value}`)}
                    active={method === value}
                    onClick={() => setMethod(value)}
                  />
                ))}
              </div>
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <Field
                  label={t('miniapp.booking.payment')}
                  value={amount}
                  onChange={setAmount}
                  type="number"
                  inputMode="numeric"
                  placeholder={String(due)}
                />
                <button
                  type="button"
                  disabled={moneyBusy}
                  onClick={() => setAmount(String(due))}
                  className="tg-root min-h-[44px] rounded-xl px-3 text-xs font-bold"
                >
                  {t('miniapp.booking.rest')}
                </button>
              </div>
              <ActionButton
                tone="primary"
                disabled={moneyBusy || !(amountValue > 0)}
                onClick={askPay}
              >
                <Wallet className="h-4 w-4" />
                {amountValue > 0
                  ? t('miniapp.booking.recordAmount', { amount: money(amountValue) })
                  : t('miniapp.booking.record')}
              </ActionButton>
            </>
          )}
        </div>
      )}

      <DepositRow
        bookingId={booking.id}
        suggestedAmount={property.data?.pricing?.default_deposit || booking.total_price}
        onError={fail}
        locked={moneyBusy}
      />

      <pre className="tg-surface max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl p-3 text-xs">
        {checkInText}
      </pre>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <ActionButton tone="primary" onClick={() => openWhatsApp(booking.guest_phone ?? '', checkInText)}>
          <Send className="h-4 w-4" />
          {t('miniapp.booking.sendGuest')}
        </ActionButton>
        <ActionButton
          onClick={async () => {
            const ok = await copyText(checkInText)
            setCopied(ok)
            window.setTimeout(() => setCopied(false), 1500)
          }}
        >
          <Copy className="h-4 w-4" />
          {copied ? t('miniapp.copied') : t('miniapp.offer.copy')}
        </ActionButton>
      </div>

      {canCancel(booking.status) && (
        <ActionButton disabled={settling || setStatus.isPending} onClick={askCancel}>
          <XCircle className="h-4 w-4" />
          {t('miniapp.booking.cancel')}
        </ActionButton>
      )}
    </Sheet>
  )
}
