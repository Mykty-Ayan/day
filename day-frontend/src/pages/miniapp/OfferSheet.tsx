/**
 * "Варианты гостю" — the answer to the most expensive question of the day.
 *
 * A guest names a date; the operator picks whatever is free, and the message
 * leaves from their own WhatsApp. Sending server-side from an unfamiliar number
 * is what gets accounts limited, so the app writes the text and hands it to the
 * operator's WhatsApp with the guest's number already filled in.
 */

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getAvailability, type AvailableProperty } from '../../api/miniapp'
import { copyText, openWhatsApp, resultFeedback, tapFeedback } from '../../lib/telegram'
import { addDays, formatMoney, toISODate } from './format'
import { buildOfferMessage } from './messages'
import { ActionButton, Chip, Field, Sheet } from './miniapp-ui'

type Period = 'tonight' | 'tomorrow' | 'weekend' | 'custom'

/** Friday to Sunday of this week, or the coming one once the weekend has passed. */
function weekendRange(today: Date): [Date, Date] {
  const daysUntilFriday = (5 - today.getDay() + 7) % 7
  const friday = addDays(today, daysUntilFriday)
  return [friday, addDays(friday, 2)]
}

function periodRange(period: Period, today: Date, custom: string, nights: number): [Date, Date] {
  if (period === 'tomorrow') return [addDays(today, 1), addDays(today, 2)]
  if (period === 'weekend') return weekendRange(today)
  if (period === 'custom' && custom) {
    const from = new Date(`${custom}T00:00:00`)
    if (!Number.isNaN(from.getTime())) return [from, addDays(from, Math.max(1, nights))]
  }
  return [today, addDays(today, 1)]
}

export default function OfferSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const today = useMemo(() => new Date(), [])

  const [period, setPeriod] = useState<Period>('tonight')
  const [customDate, setCustomDate] = useState('')
  const [nights, setNights] = useState('1')
  const [phone, setPhone] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [copied, setCopied] = useState(false)

  const nightCount = Math.max(1, parseInt(nights, 10) || 1)
  const [checkIn, checkOut] = periodRange(period, today, customDate, nightCount)

  const availability = useQuery({
    queryKey: ['miniapp', 'offer', toISODate(checkIn), toISODate(checkOut)],
    queryFn: () =>
      getAvailability(`${toISODate(checkIn)}T14:00:00`, `${toISODate(checkOut)}T12:00:00`),
    enabled: open,
  })

  const items = availability.data?.items ?? []
  const chosen = items.filter((item) => picked.includes(item.property_id))
  // Nothing picked reads as "send everything free", which is what an operator
  // in a hurry means.
  const offered = chosen.length > 0 ? chosen : items

  const message = useMemo(
    () => buildOfferMessage(offered, checkIn, checkOut, nightCount, i18n.language, t),
    [offered, checkIn, checkOut, nightCount, i18n.language, t],
  )

  function toggle(item: AvailableProperty) {
    tapFeedback()
    setPicked((current) =>
      current.includes(item.property_id)
        ? current.filter((id) => id !== item.property_id)
        : [...current, item.property_id],
    )
  }

  return (
    <Sheet open={open} title={t('miniapp.offer.title')} onClose={onClose}>
      <div className="flex gap-1">
        <Chip label={t('miniapp.periods.tonight')} active={period === 'tonight'} onClick={() => setPeriod('tonight')} />
        <Chip label={t('miniapp.periods.tomorrow')} active={period === 'tomorrow'} onClick={() => setPeriod('tomorrow')} />
        <Chip label={t('miniapp.periods.weekend')} active={period === 'weekend'} onClick={() => setPeriod('weekend')} />
        <Chip label={t('miniapp.offer.pickDate')} active={period === 'custom'} onClick={() => setPeriod('custom')} />
      </div>

      {period === 'custom' && (
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t('miniapp.offer.from')}
            type="date"
            value={customDate}
            onChange={(value) => setCustomDate(value)}
          />
          <Field
            label={t('miniapp.offer.nights')}
            type="number"
            inputMode="numeric"
            value={nights}
            onChange={setNights}
          />
        </div>
      )}

      {availability.isLoading && <p className="tg-hint text-sm">{t('miniapp.loading')}</p>}
      {availability.isError && <p className="text-sm">{t('miniapp.loadFailed')}</p>}

      {availability.data && items.length === 0 && (
        <p className="tg-hint text-sm">{t('miniapp.offer.nothingFree')}</p>
      )}

      {items.length > 0 && (
        <ul className="tg-surface tg-divide overflow-hidden rounded-xl">
          {items.map((item) => {
            const isPicked = picked.includes(item.property_id)
            return (
              <li key={item.property_id}>
                <button
                  type="button"
                  onClick={() => toggle(item)}
                  className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2.5 text-left"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      isPicked ? 'tg-active border-transparent' : 'border-current opacity-40'
                    }`}
                  >
                    {isPicked && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{item.name}</span>
                    <span className="tg-hint block truncate text-xs">{item.internal_name}</span>
                  </span>
                  <span className="shrink-0 text-xs font-bold">
                    {item.total_price !== null
                      ? formatMoney(item.total_price, i18n.language)
                      : t('miniapp.noPrice')}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {items.length > 0 && (
        <>
          <Field
            label={t('miniapp.offer.guestPhone')}
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={setPhone}
            placeholder="+7 701 000 00 00"
          />

          <pre className="tg-surface max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl p-3 text-xs">
            {message}
          </pre>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <ActionButton
              tone="primary"
              onClick={() => {
                resultFeedback('success')
                openWhatsApp(phone, message)
              }}
            >
              <Send className="h-4 w-4" />
              {t('miniapp.offer.sendWhatsApp')}
            </ActionButton>
            <ActionButton
              onClick={async () => {
                const ok = await copyText(message)
                setCopied(ok)
                window.setTimeout(() => setCopied(false), 1500)
              }}
            >
              <Copy className="h-4 w-4" />
              {copied ? t('miniapp.copied') : t('miniapp.offer.copy')}
            </ActionButton>
          </div>

          <p className="tg-hint text-xs">{t('miniapp.offer.hint')}</p>
        </>
      )}
    </Sheet>
  )
}
