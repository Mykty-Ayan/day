import { useState } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeftRight, Banknote, CreditCard, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAddPayment } from '../../hooks/useBookings'
import { useCurrency } from '../../hooks/useCurrency'
import { formatMoneyExact as formatMoney } from '../../pages/miniapp/format'
import type { Booking, PaymentMethod } from '../../types/booking'
import Button from '../ui/Button'
import NumberInput from '../ui/number-input'
import { Sheet } from '../ui/sheet'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'

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
  // One key for one payment: a retry after a lost answer records it once. The key and the
  // request live here, not in the form: the form goes when the panel closes, and a payment
  // saved after that must still leave a new key for the next one, or the next would be
  // taken for a retry of it and never recorded. A reopened panel after a lost answer is a retry.
  const addPayment = useAddPayment(booking.id)
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())
  const newPayment = () => setIdempotencyKey(crypto.randomUUID())

  function pay(amount: number, method: PaymentMethod) {
    addPayment.mutate(
      { amount, type: 'payment', method, idempotencyKey },
      {
        onSuccess: () => {
          newPayment()
          onClose()
        },
      },
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('today.takePayment')}>
      <PaymentForm
        booking={booking}
        stayDebt={stayDebt}
        ordersDue={ordersDue}
        pay={pay}
        pending={addPayment.isPending}
        failed={addPayment.isError}
        newPayment={newPayment}
      />
    </Sheet>
  )
}

function PaymentForm({
  booking,
  stayDebt,
  ordersDue,
  pay,
  pending,
  failed,
  newPayment,
}: {
  booking: Booking
  stayDebt: number
  ordersDue: number
  pay: (amount: number, method: PaymentMethod) => void
  pending: boolean
  failed: boolean
  newPayment: () => void
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

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-muted">
        {booking.property_name || booking.property_internal_name} · {booking.guest_name}
      </p>

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
        {t('common.amount')}
        <NumberInput
          value={amount}
          onChange={(next) => {
            setAmount(next)
            newPayment()
          }}
          min={0}
          step={1000}
          ariaLabel={t('common.amount')}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-ink">{t('common.method')}</span>
        <ToggleGroup
          type="single"
          value={method}
          onValueChange={(next) => {
            if (!next) return
            setMethod(next as PaymentMethod)
            newPayment()
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
      {failed && (
        <p role="alert" className="text-sm text-danger">{t('today.paymentFailed')}</p>
      )}

      <Button
        disabled={paying || !(value > 0)}
        onClick={() => pay(value, method)}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {pending
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
