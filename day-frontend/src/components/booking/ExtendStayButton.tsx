import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CalendarPlus, Minus, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { calculatePrice } from '../../api/bookings'
import { useUpdateBooking } from '../../hooks/useBookings'
import { useCurrency } from '../../hooks/useCurrency'
import { getBookingApiErrorMessage, stayRuleBreaches, stayRuleText } from '../../lib/booking-errors'
import { dateLocale } from '../../lib/date-locale'
import { extendedCheckOut } from '../../pages/miniapp/booking-card'
import { formatMoney } from '../../pages/miniapp/format'
import type { Booking } from '../../types/booking'
import Button from '../ui/Button'
import { Sheet } from '../ui/sheet'

const MAX_STEPS = 30

export default function ExtendStayButton({ booking, className }: { booking: Booking; className: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (!extendedCheckOut(booking)) return null

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
        {t('today.extend')}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('today.extend')}>
        <ExtendForm booking={booking} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  )
}

function ExtendForm({ booking, onDone }: { booking: Booking; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const update = useUpdateBooking(booking.id)
  const [steps, setSteps] = useState(1)
  const hourly = booking.rental_mode === 'hourly'
  // The server keeps a price set by hand when the dates move, so the added stay is
  // priced here and sent with them: otherwise the extra nights would be free.
  const handPriced = Number(booking.total_price) !== Number(booking.calculated_price)
  const checkOut = extendedCheckOut(booking, steps)
  const { symbol } = useCurrency()
  const money = (value: number) => `${formatMoney(value, i18n.language)} ${symbol}`
  const priceUntil = (until: string) =>
    calculatePrice({
      property_id: booking.property_id,
      check_in: booking.check_in,
      check_out: until,
      adults_count: booking.adults_count,
      children_count: booking.children_count,
      rental_mode: booking.rental_mode,
    })

  const quote = useQuery({
    // The flat too: a booking moved to another one is priced by its tariffs.
    queryKey: ['extend-quote', booking.id, booking.property_id, checkOut],
    enabled: checkOut !== null,
    // The old sums stay on screen while the new ones load: the lines must not jump.
    placeholderData: keepPreviousData,
    queryFn: () => priceUntil(checkOut!),
  })
  const current = useQuery({
    queryKey: ['extend-quote', booking.id, booking.property_id, booking.check_out],
    enabled: handPriced,
    queryFn: () => priceUntil(booking.check_out),
  })

  if (!checkOut) return null
  const paid = Number(booking.paid_amount ?? 0)
  const saved = Number(booking.total_price)
  const quoted = quote.data ? Number(quote.data.total) : null
  const before = current.data ? Number(current.data.total) : null
  let total: number | null = quoted
  if (handPriced) total = quoted !== null && before !== null ? saved + Math.max(0, quoted - before) : null
  // A hand price waits for its sum: pressed sooner, the stay would grow for free.
  const handPriceReady = !handPriced || (total !== null && !quote.isFetching)
  const stepLabel = t(hourly ? 'bookings.hours' : 'bookings.nights', { count: steps })
  const breaches = update.isError ? stayRuleBreaches(update.error) : null

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-muted">
        {booking.property_name || booking.property_internal_name} · {booking.guest_name}
      </p>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
        <button
          type="button"
          aria-label={t('today.fewer')}
          disabled={steps === 1}
          onClick={() => setSteps(steps - 1)}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-ink transition-colors hover:bg-surface-page disabled:opacity-40"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="text-base font-bold tabular-nums text-ink" aria-live="polite">{stepLabel}</span>
        <button
          type="button"
          aria-label={t('today.more')}
          disabled={steps === MAX_STEPS}
          onClick={() => setSteps(steps + 1)}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-ink transition-colors hover:bg-surface-page disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <dl className="flex flex-col gap-2 text-sm tabular-nums">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-muted">{t('today.newCheckOut')}</dt>
          <dd className="font-semibold text-ink">
            {format(new Date(checkOut), 'd MMMM, HH:mm', { locale: dateLocale(i18n.language) })}
          </dd>
        </div>
        {total !== null && (
          <>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">{t('today.extra')}</dt>
              <dd className="font-semibold text-ink">+{money(Math.max(0, total - saved))}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">{t('today.newTotal')}</dt>
              <dd className="font-semibold text-ink">{money(total)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">{t('today.alreadyPaid')}</dt>
              <dd className="font-semibold text-ink">{money(paid)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className={paid > total ? 'text-warning' : 'text-ink-muted'}>
                {t(paid > total ? 'today.overpaid' : 'today.toPay')}
              </dt>
              <dd className={`font-bold ${paid > total ? 'text-warning' : 'text-ink'}`}>{money(Math.abs(total - paid))}</dd>
            </div>
          </>
        )}
      </dl>
      {handPriced && <p className="text-sm text-warning">{t('today.handPriced')}</p>}
      {(quote.isError || current.isError) && (
        <p className="text-sm text-warning">{t(handPriced ? 'today.handQuoteFailed' : 'today.quoteFailed')}</p>
      )}
      {update.isError && (
        <p role="alert" className="text-sm text-danger">
          {breaches
            ? breaches.map((breach) => stayRuleText(breach, t)).join('. ')
            : (getBookingApiErrorMessage(update.error, t) ?? t('bookings.failedUpdate'))}
        </p>
      )}

      <Button
        disabled={update.isPending || !handPriceReady}
        onClick={() =>
          update.mutate(
            handPriced && total !== null ? { check_out: checkOut, total_price: total } : { check_out: checkOut },
            { onSuccess: onDone },
          )
        }
      >
        <CalendarPlus className="h-4 w-4" aria-hidden="true" />
        {update.isPending ? '…' : t('today.extendBy', { value: stepLabel })}
      </Button>
    </div>
  )
}
