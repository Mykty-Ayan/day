/**
 * "Is it free, and how much?" — answered while the guest is still on the line:
 * nights or hours, for this many guests, with the price for the whole stay.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DoorOpen, Minus, Plus, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getAvailability, type AvailableProperty } from '../../api/miniapp'
import { tapFeedback } from '../../lib/telegram'
import { formatDay, formatMoney, formatTime, toISODate } from './format'
import { ActionButton, Chip, Field, Section } from './miniapp-ui'
import { hourlyRange, nightsBetween, periodRange, type Period, type SellRange } from './sell'

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  const step = (delta: number) => {
    tapFeedback()
    onChange(Math.min(max, Math.max(min, value + delta)))
  }
  return (
    <div className="tg-surface flex items-center justify-between rounded-xl px-3 py-2">
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-3">
        <button type="button" aria-label="−" onClick={() => step(-1)} className="tg-root h-9 w-9 rounded-full">
          <Minus className="mx-auto h-4 w-4" />
        </button>
        <span className="w-6 text-center text-sm font-bold">{value}</span>
        <button type="button" aria-label="+" onClick={() => step(1)} className="tg-root h-9 w-9 rounded-full">
          <Plus className="mx-auto h-4 w-4" />
        </button>
      </span>
    </div>
  )
}

export default function SellScreen({
  enabled,
  today,
  onOffer,
  onPick,
}: {
  enabled: boolean
  today: Date
  onOffer: () => void
  onPick: (unit: AvailableProperty, range: SellRange) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [mode, setMode] = useState<'daily' | 'hourly'>('daily')
  const [period, setPeriod] = useState<Period>('tonight')
  const [customDate, setCustomDate] = useState('')
  const [nights, setNights] = useState(1)
  const [hourDate, setHourDate] = useState(() => toISODate(today))
  const [start, setStart] = useState('12:00')
  const [hours, setHours] = useState(2)
  const [guests, setGuests] = useState(2)

  let range: SellRange | null
  let caption: string
  if (mode === 'daily') {
    const [from, to] = periodRange(period, today, customDate, nights)
    range = { checkIn: toISODate(from), checkOut: toISODate(to), rentalMode: 'daily', guests }
    // Midday: a bare date parses as UTC midnight and can show the day before.
    caption = `${formatDay(`${range.checkIn}T12:00:00`, lang)} — ${formatDay(`${range.checkOut}T12:00:00`, lang)} · ${t('miniapp.book.nights', {
      count: nightsBetween(from, to),
    })}`
  } else {
    const slot = hourlyRange(hourDate, start, hours)
    range = slot ? { ...slot, rentalMode: 'hourly', guests } : null
    caption = range
      ? `${formatDay(range.checkIn, lang)} ${formatTime(range.checkIn, lang)}–${formatTime(range.checkOut, lang)} · ${t(
          'miniapp.sell.hoursShort',
          { count: hours },
        )}`
      : t('miniapp.sell.pickSlot')
  }

  const availability = useQuery({
    queryKey: ['miniapp', 'availability', range?.rentalMode, range?.checkIn, range?.checkOut, guests],
    queryFn: () => getAvailability(range!.checkIn, range!.checkOut, { adults: guests, rentalMode: range!.rentalMode }),
    enabled: enabled && range !== null,
  })

  return (
    <>
      <div className="flex gap-1">
        <Chip label={t('miniapp.sell.daily')} active={mode === 'daily'} onClick={() => setMode('daily')} />
        <Chip label={t('miniapp.sell.hourly')} active={mode === 'hourly'} onClick={() => setMode('hourly')} />
      </div>

      {mode === 'daily' ? (
        <>
          <div className="flex gap-1">
            {(['tonight', 'tomorrow', 'weekend', 'custom'] as Period[]).map((value) => (
              <Chip
                key={value}
                label={t(`miniapp.periods.${value}`)}
                active={period === value}
                onClick={() => setPeriod(value)}
              />
            ))}
          </div>
          {period === 'custom' && (
            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <Field
                label={t('miniapp.sell.from')}
                value={customDate}
                onChange={setCustomDate}
                type="date"
                min={toISODate(today)}
              />
              <Stepper label={t('miniapp.sell.nights')} value={nights} min={1} max={30} onChange={setNights} />
            </div>
          )}
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('miniapp.sell.date')} value={hourDate} onChange={setHourDate} type="date" min={toISODate(today)} />
          <Field label={t('miniapp.sell.start')} value={start} onChange={setStart} type="time" />
          <div className="col-span-2">
            <Stepper label={t('miniapp.sell.hours')} value={hours} min={1} max={12} onChange={setHours} />
          </div>
        </div>
      )}

      <Stepper label={t('miniapp.sell.guests')} value={guests} min={1} max={10} onChange={setGuests} />

      <p className="tg-hint text-xs">{caption}</p>

      <ActionButton onClick={onOffer}>
        <Send className="h-4 w-4" />
        {t('miniapp.offer.title')}
      </ActionButton>

      {availability.isLoading && <p className="tg-hint text-sm">{t('miniapp.loading')}</p>}
      {availability.isError && <p className="text-sm">{t('miniapp.loadFailed')}</p>}

      {availability.data && range && (
        <Section
          icon={<DoorOpen className="h-4 w-4" />}
          title={t('miniapp.freeProperties')}
          count={availability.data.items.length}
          emptyLabel={t('miniapp.offer.nothingFree')}
        >
          {availability.data.items.map((item) => (
            <button
              key={item.property_id}
              type="button"
              disabled={item.total_price === null}
              onClick={() => {
                tapFeedback()
                onPick(item, range)
              }}
              className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2.5 text-left disabled:opacity-60"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{item.name}</span>
                <span className="tg-hint block truncate text-xs">{item.internal_name}</span>
              </span>
              <span className="shrink-0 text-xs font-bold">
                {item.total_price !== null ? `${formatMoney(item.total_price, lang)} ₸` : t('miniapp.noPrice')}
              </span>
            </button>
          ))}
        </Section>
      )}
    </>
  )
}
