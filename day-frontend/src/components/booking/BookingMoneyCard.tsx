import { useState } from 'react'
import { CircleCheck, CircleX, Plus, ShieldCheck, Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCurrency } from '../../hooks/useCurrency'
import type { bookingMoney } from '../../lib/booking-money'
import { formatMoneyExact as formatMoney } from '../../pages/miniapp/format'
import type { Booking, BookingDeposit } from '../../types/booking'
import Button from '../ui/Button'
import BookingPriceLines from './BookingPriceLines'
import TakePaymentPanel from './TakePaymentPanel'

/** The money of a stay: one big number for what matters now, the rest under it. */
export default function BookingMoneyCard({
  booking,
  money,
  deposits,
  depositLabel,
  onRefund,
  refunding,
}: {
  booking: Booking
  money: ReturnType<typeof bookingMoney>
  deposits: BookingDeposit[]
  depositLabel: (deposit: BookingDeposit) => string
  onRefund: () => void
  refunding: boolean
}) {
  const { t, i18n } = useTranslation()
  const { symbol } = useCurrency()
  const [paying, setPaying] = useState(false)
  const sum = (value: number) => `${formatMoney(value, i18n.language)} ${symbol}`
  const share = money.total > 0 ? Math.min(1, Math.max(0, money.paid / money.total)) : 0
  const deposit = deposits[0]
  const cancelled = booking.status === 'cancelled'

  return (
    <section className="rounded-2xl border border-line bg-surface-card p-5">
      {money.toReturn > 0 ? (
        <>
          <Headline
            label={booking.status === 'cancelled' ? t('bookings.card.toReturn') : t('bookings.payments.overpaid')}
            value={sum(money.toReturn)}
            tone="text-warning"
          />
          {booking.status !== 'cancelled' && <p className="mt-1 text-xs text-ink-muted">{t('bookings.card.overpaidHint')}</p>}
        </>
      ) : cancelled ? (
        // Not "paid": nothing came in and nothing is owed because the stay is off.
        <>
          <p className="flex items-center gap-2 text-2xl font-bold text-ink-muted">
            <CircleX className="h-6 w-6" aria-hidden="true" />
            {t('bookings.card.cancelled')}
          </p>
          <p className="mt-1 text-xs text-ink-muted">{t('bookings.card.cancelledOwesNothing')}</p>
        </>
      ) : money.owes > 0 ? (
        <Headline label={t('today.toPay')} value={sum(money.owes)} tone="text-danger" />
      ) : (
        <p className="flex items-center gap-2 text-2xl font-bold text-success">
          <CircleCheck className="h-6 w-6" aria-hidden="true" />
          {t('bookings.card.paid')}
        </p>
      )}

      {money.total > 0 && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-page">
          <div className="h-full rounded-full bg-accent" style={{ width: `${share * 100}%` }} />
        </div>
      )}

      <dl className="mt-4 flex flex-col gap-2 text-sm">
        {cancelled ? (
          <Line label={t('bookings.card.cancelledPrice')} value={sum(Number(booking.total_price))} struck />
        ) : (
          <Line label={t('today.newTotal')} value={sum(money.total)} />
        )}
        <Line label={t('today.alreadyPaid')} value={sum(money.paid)} />
        {(booking.orders_due ?? 0) > 0 && <Line label={t('bookings.card.minibar')} value={sum(booking.orders_due ?? 0)} />}
      </dl>

      {booking.status !== 'cancelled' && <BookingPriceLines booking={booking} />}

      {money.toReturn > 0 && (
        <Button className="mt-4 w-full" onClick={onRefund} disabled={refunding}>
          <Undo2 className="h-4 w-4" aria-hidden="true" />
          {t('bookings.card.refund', { amount: sum(money.toReturn) })}
        </Button>
      )}

      {/* Always there: money may come after a cancellation or on top of the total. */}
      <Button
        variant={money.owes > 0 ? 'primary' : 'secondary'}
        className="mt-4 w-full"
        onClick={() => setPaying(true)}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t('bookings.payments.addPayment')}
      </Button>

      {!(cancelled && !deposit) && (
        <a
          href="#deposits"
          className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-sm transition-colors hover:text-accent-ink"
        >
          <ShieldCheck className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
          <span className="text-ink-muted">{t('bookings.card.deposit')}</span>
          <span className="ml-auto min-w-0 truncate font-semibold text-ink">
            {deposit ? depositLabel(deposit) : t('bookings.card.noDeposit')}
          </span>
        </a>
      )}

      <TakePaymentPanel
        booking={booking}
        stayDebt={money.owes}
        ordersDue={booking.orders_due ?? 0}
        open={paying}
        onClose={() => setPaying(false)}
      />
    </section>
  )
}

function Headline({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${tone}`}>{value}</p>
    </>
  )
}

function Line({ label, value, struck = false }: { label: string; value: string; struck?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`font-semibold tabular-nums ${struck ? 'text-ink-muted line-through' : 'text-ink'}`}>{value}</dd>
    </div>
  )
}
