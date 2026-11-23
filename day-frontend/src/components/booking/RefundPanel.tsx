import { useState } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { ArrowLeftRight, Banknote, CreditCard, Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCurrency } from '../../hooks/useCurrency'
import { useSendPayment, type PaymentAttempt, type SendOutcome } from '../../hooks/usePaymentAttempt'
import { halfOf, type bookingMoney } from '../../lib/booking-money'
import { formatMoneyExact as formatMoney } from '../../pages/miniapp/format'
import type { Booking, PaymentMethod } from '../../types/booking'
import Button from '../ui/Button'
import NumberInput from '../ui/number-input'
import { Sheet } from '../ui/sheet'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import QuickAmounts from './QuickAmounts'
import UnsureAttempt from './UnsureAttempt'

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
  // The request lives here, not in the form: the form goes when the panel closes, and the
  // answer may come after that.
  const payment = useSendPayment(booking.id, onClose)

  return (
    <Sheet open={open} onClose={onClose} title={t('bookings.refund.title')}>
      <RefundForm
        booking={booking}
        money={money}
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

function RefundForm({
  booking,
  money,
  unsure,
  outcome,
  checking,
  pending,
  send,
  check,
}: {
  booking: Booking
  money: ReturnType<typeof bookingMoney>
  unsure: PaymentAttempt | null
  outcome: SendOutcome | null
  checking: boolean
  pending: boolean
  send: (input: PaymentAttempt) => void
  check: () => void
}) {
  const { t, i18n } = useTranslation()
  const { symbol } = useCurrency()
  // Opens with what is due back; with nothing due, the owner says how much.
  const [amount, setAmount] = useState(money.toReturn > 0 ? String(money.toReturn) : '')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const value = Number(amount)
  const sum = (n: number) => `${formatMoney(n, i18n.language)} ${symbol}`
  // Any payment of this booking on its way, from this panel or another one on the screen.
  const paying = useIsMutating({ mutationKey: ['add-payment', booking.id] }) > 0

  const paid = Math.max(0, money.paid)
  const quick = [
    ...(money.toReturn > 0 ? [{ label: t('bookings.payments.overpaid'), value: money.toReturn }] : []),
    { label: t('bookings.refund.all'), value: paid },
    { label: '50%', value: halfOf(paid) },
  ]

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
        {booking.property_name || booking.property_internal_name} · {booking.guest_name} ·{' '}
        {t('bookings.refund.paid', { amount: sum(paid) })}
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="refund-amount" className="text-sm font-semibold text-ink">
          {t('common.amount')}
        </label>
        <NumberInput id="refund-amount" value={amount} onChange={setAmount} min={0} step={1000} ariaLabel={t('common.amount')} />
        <QuickAmounts options={quick} value={value} onPick={(next) => setAmount(String(next))} />
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
        onClick={() => send({ type: 'refund', amount: value, method, note: note.trim() || undefined })}
      >
        <Undo2 className="h-4 w-4" aria-hidden="true" />
        {pending || checking ? '…' : t('bookings.card.refund', { amount: sum(value || 0) })}
      </Button>
    </div>
  )
}
