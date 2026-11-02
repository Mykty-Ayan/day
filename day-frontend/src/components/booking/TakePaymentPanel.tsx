import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeftRight, Banknote, CreditCard, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAddPayment } from '../../hooks/useBookings'
import { useCurrency } from '../../hooks/useCurrency'
import { formatMoney } from '../../pages/miniapp/format'
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
  // One key for one payment: a retry after a lost answer records it once. It lives
  // here because the form goes when the panel closes, and a reopened panel is a retry.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID())

  return (
    <Sheet open={open} onClose={onClose} title={t('today.takePayment')}>
      <PaymentForm
        booking={booking}
        stayDebt={stayDebt}
        ordersDue={ordersDue}
        idempotencyKey={idempotencyKey}
        newPayment={() => setIdempotencyKey(crypto.randomUUID())}
        onDone={onClose}
      />
    </Sheet>
  )
}

function PaymentForm({
  booking,
  stayDebt,
  ordersDue,
  idempotencyKey,
  newPayment,
  onDone,
}: {
  booking: Booking
  stayDebt: number
  ordersDue: number
  idempotencyKey: string
  newPayment: () => void
  onDone: () => void
}) {
  const { t, i18n } = useTranslation()
  const addPayment = useAddPayment(booking.id)
  const [amount, setAmount] = useState(String(stayDebt))
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const value = Number(amount)
  const { symbol } = useCurrency()
  const money = (sum: number) => formatMoney(sum, i18n.language)

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
      {addPayment.isError && (
        <p role="alert" className="text-sm text-danger">{t('today.paymentFailed')}</p>
      )}

      <Button
        disabled={addPayment.isPending || !(value > 0)}
        onClick={() =>
          addPayment.mutate(
            { amount: value, type: 'payment', method, idempotencyKey },
            {
              onSuccess: () => {
                newPayment()
                onDone()
              },
            },
          )
        }
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {addPayment.isPending
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
