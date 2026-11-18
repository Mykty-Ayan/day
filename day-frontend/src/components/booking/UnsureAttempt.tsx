import { useTranslation } from 'react-i18next'
import type { PaymentAttempt } from '../../hooks/usePaymentAttempt'
import Button from '../ui/Button'

/** A payment or refund sent with no answer, which the server could not be asked about either:
 *  nothing else is offered, only to send it again as it was (recorded once) or to ask again. */
export default function UnsureAttempt({
  attempt,
  sum,
  busy,
  onRetry,
  onCheck,
}: {
  attempt: PaymentAttempt
  sum: (value: number) => string
  busy: boolean
  onRetry: () => void
  onCheck: () => void
}) {
  const { t } = useTranslation()
  const refund = attempt.type === 'refund'
  const amount = sum(attempt.amount)
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4">
      <p className="text-sm text-ink">
        {t(refund ? 'bookings.attempt.unsettledRefund' : 'bookings.attempt.unsettledPayment', { amount })}
      </p>
      <Button onClick={onRetry} disabled={busy}>
        {t(refund ? 'bookings.attempt.retryRefund' : 'bookings.attempt.retryPayment', { amount })}
      </Button>
      <Button variant="secondary" onClick={onCheck} disabled={busy}>
        {busy ? '…' : t('bookings.attempt.check')}
      </Button>
    </div>
  )
}
