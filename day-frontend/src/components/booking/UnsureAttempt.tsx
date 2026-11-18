import { useTranslation } from 'react-i18next'
import type { PaymentAttempt } from '../../lib/payment-attempt'
import Button from '../ui/Button'

/** A payment or refund sent with no answer, which the server could not be asked about yet.
 *  Nothing more is sent for the booking until the server says whether it was recorded:
 *  sending it again could be read as it, and a new payment of the same sum would be lost. */
export default function UnsureAttempt({
  attempt,
  sum,
  busy,
  onCheck,
}: {
  attempt: PaymentAttempt
  sum: (value: number) => string
  busy: boolean
  onCheck: () => void
}) {
  const { t } = useTranslation()
  const amount = sum(attempt.amount)
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4">
      <p className="text-sm text-ink">
        {t(attempt.type === 'refund' ? 'bookings.attempt.unsettledRefund' : 'bookings.attempt.unsettledPayment', { amount })}
      </p>
      <Button onClick={onCheck} disabled={busy}>
        {busy ? '…' : t('bookings.attempt.check')}
      </Button>
    </div>
  )
}
