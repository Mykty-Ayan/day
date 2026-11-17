import { useState } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { ArrowLeftRight, Banknote, CreditCard, Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAddPayment } from '../../hooks/useBookings'
import { useCurrency } from '../../hooks/useCurrency'
import { usePaymentAttempt, type PaymentAttempt } from '../../hooks/usePaymentAttempt'
import { halfOf, type bookingMoney } from '../../lib/booking-money'
import { formatMoneyExact as formatMoney } from '../../pages/miniapp/format'
import type { Booking, PaymentMethod } from '../../types/booking'
import Button from '../ui/Button'
import NumberInput from '../ui/number-input'
import { Sheet } from '../ui/sheet'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'

/** Money given back to the guest: what was paid over the total, or part of what came in. */
export default function RefundPanel({
  booking,
  money,
  open,
  onClose,
}: {
  booking: Booking
  money: ReturnType<typeof bookingMoney>
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  // The request and its key live here, not in the form: the form goes when the panel closes,
  // and the answer may come after that.
  const addPayment = useAddPayment(booking.id)
  const attempt = usePaymentAttempt()

  function refund(input: PaymentAttempt) {
    addPayment.mutate(
      { ...input, type: 'refund', idempotencyKey: attempt.keyFor(input) },
      {
        onSuccess: () => {
          attempt.settled()
          onClose()
        },
      },
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('bookings.refund.title')}>
      <RefundForm
        booking={booking}
        money={money}
        last={attempt.last}
        refund={refund}
        pending={addPayment.isPending}
        failed={addPayment.isError}
      />
    </Sheet>
  )
}

function RefundForm({
  booking,
  money,
  last,
  refund,
  pending,
  failed,
}: {
  booking: Booking
  money: ReturnType<typeof bookingMoney>
  last: PaymentAttempt | null
  refund: (input: PaymentAttempt) => void
  pending: boolean
  failed: boolean
}) {
  const { t, i18n } = useTranslation()
  const { symbol } = useCurrency()
  // Opens with a refund whose answer never came, as it was sent; else with what is due back;
  // with nothing due, the owner says how much.
  const [amount, setAmount] = useState(last ? String(last.amount) : money.toReturn > 0 ? String(money.toReturn) : '')
  const [method, setMethod] = useState<PaymentMethod>(last?.method ?? 'cash')
  const [note, setNote] = useState(last?.note ?? '')
  const value = Number(amount)
  const sum = (n: number) => `${formatMoney(n, i18n.language)} ${symbol}`
  // Any payment of this booking on its way, from this panel or another one on the screen.
  const paying = useIsMutating({ mutationKey: ['add-payment', booking.id] }) > 0

  const paid = Math.max(0, money.paid)
  const quick = [
    ...(money.toReturn > 0 ? [{ label: t('bookings.payments.overpaid'), value: money.toReturn }] : []),
    { label: t('bookings.refund.all'), value: paid },
    { label: '50%', value: halfOf(paid) },
  ].filter((option, i, all) => option.value > 0 && all.findIndex((o) => o.value === option.value) === i)

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-muted">
        {booking.property_name || booking.property_internal_name} · {booking.guest_name} ·{' '}
        {t('bookings.refund.paid', { amount: sum(paid) })}
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="refund-amount" className="text-sm font-semibold text-ink">
          {t('common.amount')}
        </label>
        <NumberInput id="refund-amount" value={amount} onChange={setAmount} min={0} step={1000} ariaLabel={t('common.amount')} />
        {quick.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-2">
            {quick.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setAmount(String(option.value))}
                aria-pressed={value === option.value}
                className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-page aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-ink"
              >
                {option.label} · {sum(option.value)}
              </button>
            ))}
          </div>
        )}
      </div>

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

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
        {t('common.noteOptional')}
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="h-11 rounded-xl border border-line bg-surface-card px-3 text-sm font-normal text-ink outline-none focus:border-accent"
        />
      </label>

      {failed && (
        <p role="alert" className="text-sm text-danger">
          {t('bookings.refund.failed')}
        </p>
      )}

      <Button
        disabled={paying || !(value > 0)}
        onClick={() => refund({ amount: value, method, note: note.trim() || undefined })}
      >
        <Undo2 className="h-4 w-4" aria-hidden="true" />
        {pending ? '…' : t('bookings.card.refund', { amount: sum(value || 0) })}
      </Button>
    </div>
  )
}
