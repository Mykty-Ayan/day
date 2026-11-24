import { useState } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeftRight, Banknote, CreditCard, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCurrency } from '../../hooks/useCurrency'
import { useFirstNight } from '../../hooks/useFirstNight'
import { useSendPayment, type PaymentAttempt, type SendOutcome } from '../../hooks/usePaymentAttempt'
import { paymentSuggestions } from '../../lib/booking-money'
import { formatMoneyExact as formatMoney } from '../../pages/miniapp/format'
import type { Booking, PaymentMethod } from '../../types/booking'
import Button from '../ui/Button'
import NumberInput from '../ui/number-input'
import { Sheet } from '../ui/sheet'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import QuickAmounts from './QuickAmounts'
import UnsureAttempt from './UnsureAttempt'

/** The stay's debt only: minibar orders are settled in their own screen. */
export default function TakePaymentPanel({
  booking,
  stayDebt,
  ordersDue,
  open,
  onClose,
}: {
  booking: Booking
  stayDebt: number
  ordersDue: number
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  // The request lives here, not in the form: the form goes when the panel closes, and the
  // answer may come after that.
  const payment = useSendPayment(booking.id, onClose)

  return (
    <Sheet open={open} onClose={onClose} title={t('today.takePayment')}>
      <PaymentForm
        booking={booking}
        stayDebt={stayDebt}
        ordersDue={ordersDue}
        unsure={payment.unsure?.attempt ?? null}
        outcome={payment.outcome}
        checking={payment.checking}
        pending={payment.pending}
        send={payment.send}
        check={payment.check}
      />
    </Sheet>
  )
}

function PaymentForm({
  booking,
  stayDebt,
  ordersDue,
  unsure,
  outcome,
  checking,
  pending,
  send,
  check,
}: {
  booking: Booking
  stayDebt: number
  ordersDue: number
  unsure: PaymentAttempt | null
  outcome: SendOutcome | null
  checking: boolean
  pending: boolean
  send: (input: PaymentAttempt) => void
  check: () => void
}) {
  const { t, i18n } = useTranslation()
  const [amount, setAmount] = useState(String(stayDebt))
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const value = Number(amount)
  const { symbol } = useCurrency()
  const money = (sum: number) => formatMoney(sum, i18n.language)
  // Any payment of this booking on its way, from this panel or another one on the
  // screen: each has its own idempotency key, and both would be recorded.
  const paying = useIsMutating({ mutationKey: ['add-payment', booking.id] }) > 0
  const sum = (value: number) => `${money(value)} ${symbol}`
  const suggested = paymentSuggestions(stayDebt, Number(booking.total_price), useFirstNight(booking))

  if (unsure && !paying) {
    return <UnsureAttempt
        attempt={unsure}
        sum={sum}
        busy={checking}
        unreachable={outcome?.result === 'unknown'}
        onCheck={check}
      />
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-muted">
        {booking.property_name || booking.property_internal_name} · {booking.guest_name}
      </p>

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
        {t('common.amount')}
        <NumberInput
          value={amount}
          onChange={setAmount}
          min={0}
          step={1000}
          ariaLabel={t('common.amount')}
        />
      </label>
      <QuickAmounts
        value={value}
        onPick={(next) => setAmount(String(next))}
        options={[
          ...(suggested.firstNight !== null ? [{ label: t('today.quickFirstNight'), value: suggested.firstNight }] : []),
          ...(suggested.half !== null ? [{ label: '50%', value: suggested.half }] : []),
          { label: t('today.quickRest'), value: suggested.all },
        ]}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink">{t('common.method')}</span>
        <ToggleGroup
          type="single"
          value={method}
          onValueChange={(next) => {
            if (!next) return
            setMethod(next as PaymentMethod)
          }}
        >
          <ToggleGroupItem value="cash">
            <Banknote className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {t('common.cash')}
          </ToggleGroupItem>
          <ToggleGroupItem value="card">
            <CreditCard className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {t('common.card')}
          </ToggleGroupItem>
          <ToggleGroupItem value="transfer">
            <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {t('common.transfer')}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {value > stayDebt && (
        <p className="text-sm text-warning">{t('today.moreThanDebt', { amount: money(value - stayDebt), symbol })}</p>
      )}
      {ordersDue > 0 && (
        <p className="text-sm text-ink-muted">
          {t('today.ordersApart', { amount: money(ordersDue), symbol })}
        </p>
      )}
      {outcome?.result === 'refused' && (
        <p role="alert" className="text-sm text-danger">
          {outcome.reason
            ? t('bookings.attempt.refusedBecause', { reason: outcome.reason })
            : t('bookings.attempt.refused')}
        </p>
      )}
      {outcome?.result === 'notRecorded' && (
        <p role="alert" className="text-sm text-danger">
          {t(outcome.attempt.type === 'refund' ? 'bookings.attempt.notRecordedRefund' : 'bookings.attempt.notRecordedPayment', {
            amount: sum(outcome.attempt.amount),
          })}
        </p>
      )}

      <Button
        disabled={paying || checking || !(value > 0)}
        onClick={() => send({ type: 'payment', amount: value, method })}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {pending || checking
          ? '…'
          : t('today.takeAmount', { amount: money(value || 0), symbol })}
      </Button>

      <Link
        to="/bookings/$bookingId"
        params={{ bookingId: booking.id }}
        className="text-center text-sm font-semibold text-accent-ink"
      >
        {t('today.openBooking')}
      </Link>
    </div>
  )
}
