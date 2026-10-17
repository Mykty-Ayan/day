import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format, parseISO, subDays } from 'date-fns'
import { X } from 'lucide-react'
import { useClearDayPrices, useSetDayPrices } from '../../hooks/useProperties'
import { showToast } from '../ui/Toast'

export interface DayPriceSelection {
  propertyId: string
  flatName: string
  /** The first night and the day after the last one, as a stay's. */
  startDate: string
  endDate: string
  /** The first night's price set on the calendar, if any. */
  price: number | null
}

const short = (value: string) => format(parseISO(value), 'dd.MM')

// Digits with spaces between thousands, and kopecks after a point or a comma.
// "25,000" is no 25: a comma with three digits after it is not a decimal one.
const MAX_PRICE = 99_999_999.99
function readPrice(text: string): number | null {
  const plain = text.replace(/\s+/g, '')
  if (!/^\d+([.,]\d{1,2})?$/.test(plain)) return null
  const value = Number(plain.replace(',', '.'))
  return value > 0 && value <= MAX_PRICE ? value : null
}

/** A price for the chosen nights, as Airbnb's custom nightly price: it replaces the
 *  flat's usual price on them. Bookings made keep their price. */
export default function DayPriceDialog({ selection, onClose }: { selection: DayPriceSelection; onClose: () => void }) {
  const { t } = useTranslation()
  const [price, setPrice] = useState(selection.price ? String(selection.price) : '')
  const save = useSetDayPrices()
  const reset = useClearDayPrices()
  const busy = save.isPending || reset.isPending
  const nights = Math.round((parseISO(selection.endDate).getTime() - parseISO(selection.startDate).getTime()) / 86400000)
  const last = format(subDays(parseISO(selection.endDate), 1), 'yyyy-MM-dd')
  const value = readPrice(price)
  const range = { propertyId: selection.propertyId, start_date: selection.startDate, end_date: selection.endDate }

  function done(message: string) {
    showToast('success', message)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-overlay flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onClose} />
      <form
        role="dialog"
        aria-modal="true"
        aria-label={t('gantt.priceTitle')}
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault()
          if (value === null) return
          save.mutate(
            { ...range, price: value },
            { onSuccess: () => done(t('gantt.priceSaved')), onError: () => showToast('error', t('gantt.priceFailed')) },
          )
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label={t('common.cancel')}
          className="absolute right-3 top-3 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
        <h3 className="text-sm font-bold text-gray-900">{t('gantt.priceTitle')}</h3>
        <p className="mt-1 text-sm text-gray-500">
          {selection.flatName} · {short(selection.startDate)}
          {nights > 1 ? ` – ${short(last)}` : ''} · {t('gantt.priceNights', { n: nights })}
        </p>
        <label className="mt-4 block text-xs font-semibold text-gray-600" htmlFor="day-price">
          {t('gantt.priceTitle')}
        </label>
        <input
          id="day-price"
          inputMode="decimal"
          autoFocus
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none focus:ring-2 focus:ring-black/10"
        />
        {price.trim() !== '' && value === null ? (
          <p className="mt-1 text-xs text-red-600">{t('gantt.priceInvalid')}</p>
        ) : (
          <p className="mt-1 text-xs text-gray-400">{t('gantt.priceHint')}</p>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-between">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              reset.mutate(range, {
                onSuccess: () => done(t('gantt.priceResetDone')),
                onError: () => showToast('error', t('gantt.priceFailed')),
              })
            }
            className="min-h-[44px] rounded-xl border border-gray-200 px-4 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {t('gantt.priceReset')}
          </button>
          <button
            type="submit"
            disabled={busy || value === null}
            className="min-h-[44px] rounded-xl bg-black px-4 text-xs font-bold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {t('gantt.priceSave')}
          </button>
        </div>
      </form>
    </div>
  )
}
