import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCalculatePrice } from '../../hooks/useBookings'
import { useCurrency } from '../../hooks/useCurrency'
import { priceLines, type PriceLine } from '../../lib/booking-money'
import { formatMoney } from '../../pages/miniapp/format'
import type { Booking, PriceCalculation } from '../../types/booking'

const LABELS: Record<PriceLine['kind'], string> = {
  weekend: 'bookings.weekendSurcharge',
  season: 'bookings.seasonalAdjustment',
  guests: 'bookings.extraGuestSurcharge',
  discount: 'bookings.discount',
}

const SOLD_TARIFFS = ['3h', '6h', 'night']

/** Where the total came from. Worked out on opening: most bookings never need it. */
export default function BookingPriceLines({ booking }: { booking: Booking }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { data } = useCalculatePrice(
    open
      ? {
          property_id: booking.property_id,
          check_in: booking.check_in,
          check_out: booking.check_out,
          adults_count: booking.adults_count,
          children_count: booking.children_count,
          rental_mode: booking.rental_mode,
        }
      : null,
  )

  return (
    <details className="mt-3 text-sm" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="min-h-[32px] cursor-pointer text-xs font-bold text-accent-ink">{t('bookings.card.howPriced')}</summary>
      {data && <Reckoning booking={booking} calculation={data} />}
    </details>
  )
}

function Reckoning({ booking, calculation }: { booking: Booking; calculation: PriceCalculation }) {
  const { t, i18n } = useTranslation()
  const { symbol } = useCurrency()
  const sum = (value: number) => `${value < 0 ? '−' : ''}${formatMoney(Math.abs(value), i18n.language)} ${symbol}`
  const booked = Number(booking.calculated_price)
  const lines = priceLines(calculation, booked)
  const manual = Math.abs(Number(booking.total_price) - booked) >= 1
  const base = Number(calculation.base_total)
  const nights = calculation.nights
  const tariff = calculation.tariff

  const baseLabel =
    nights > 0
      ? `${t('bookings.nights', { count: nights })} × ${sum(base / nights)}`
      : tariff && SOLD_TARIFFS.includes(tariff)
        ? t(`guest.tariff_${tariff}`)
        : t('bookings.hours', { count: calculation.hours })

  return (
    <dl className="mt-1 flex flex-col gap-1.5 text-xs">
      {lines ? (
        <>
          <Row label={baseLabel} value={sum(base)} />
          {lines.map((line) => (
            <Row key={line.kind} label={t(LABELS[line.kind])} value={sum(line.amount)} />
          ))}
        </>
      ) : (
        <p className="text-ink-muted">{t('bookings.card.priceChanged')}</p>
      )}
      {manual && <Row label={t('bookings.card.priceManual')} value={sum(Number(booking.total_price))} />}
    </dl>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="whitespace-nowrap font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  )
}
