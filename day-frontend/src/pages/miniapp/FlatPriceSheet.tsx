/**
 * The flat's price from the phone: the usual nightly price, and a price for
 * chosen nights (a holiday, a quiet week). Every change of money is confirmed
 * first; bookings already made keep their price.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { clearDayPrices, createOrUpdatePricing, listDayPrices, setDayPrices } from '../../api/properties'
import { confirmAction, resultFeedback } from '../../lib/telegram'
import type { Property } from '../../types/property'
import { errorText } from './errors'
import { nightRange, parsePrice, priceRuns, pricingWithBase } from './flat-edit'
import { addDays, formatDay, formatMoney, toISODate } from './format'
import { ActionButton, Field, Sheet } from './miniapp-ui'

// How far ahead the priced nights are listed.
const DAY_PRICES_AHEAD = 90

export default function FlatPriceSheet({ flat, onClose }: { flat: Property; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const today = toISODate(new Date())
  const [base, setBase] = useState(String(flat.pricing?.base_price ?? ''))
  const [first, setFirst] = useState(today)
  const [last, setLast] = useState(today)
  const [dayPrice, setDayPrice] = useState('')
  const [error, setError] = useState('')
  const money = (value: number) => `${formatMoney(value, i18n.language)} ₸`
  const day = (value: string) => formatDay(`${value}T12:00:00`, i18n.language)

  const priced = useQuery({
    queryKey: ['miniapp', 'day-prices', flat.id],
    queryFn: () => listDayPrices(flat.id, today, toISODate(addDays(new Date(), DAY_PRICES_AHEAD))),
  })

  const change = useMutation({
    mutationFn: (send: () => Promise<unknown>) => send(),
    onSuccess: () => {
      resultFeedback('success')
      queryClient.invalidateQueries({ queryKey: ['miniapp'] })
    },
    onError: (mutationError) => {
      resultFeedback('error')
      setError(errorText(mutationError, t('miniapp.loadFailed'), t))
    },
  })

  async function saveBase() {
    setError('')
    const price = parsePrice(base)
    if (price === null) return setError(t('miniapp.flat.errors.price'))
    const was = Number(flat.pricing?.base_price ?? 0)
    if (price === was) return
    if (await confirmAction(t('miniapp.flat.baseAsk', { was: money(was), now: money(price) }))) {
      change.mutate(() => createOrUpdatePricing(flat.id, pricingWithBase(flat.pricing, price)))
    }
  }

  async function changeNights(clear: boolean) {
    setError('')
    const range = nightRange(first, last)
    if (!range) return setError(t('miniapp.flat.errors.nights'))
    const price = parsePrice(dayPrice)
    // The server takes a price above zero; zero would be a free night, not "usual".
    if (!clear && (price === null || price === 0)) return setError(t('miniapp.flat.errors.price'))
    const nights = { from: day(first), to: day(last) }
    const asked = clear
      ? t('miniapp.flat.clearAsk', nights)
      : t('miniapp.flat.dayAsk', { ...nights, price: money(price!) })
    if (!(await confirmAction(asked))) return
    change.mutate(() => (clear ? clearDayPrices(flat.id, range) : setDayPrices(flat.id, { ...range, price: price! })))
  }

  const busy = change.isPending

  return (
    <Sheet open title={t('miniapp.flat.pricesTitle')} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('miniapp.flat.basePrice')} inputMode="numeric" value={base} onChange={setBase} />
        <ActionButton disabled={busy} onClick={saveBase}>
          {t('miniapp.flat.saveBase')}
        </ActionButton>

        <div className="space-y-2 pt-2">
          <p className="tg-hint text-xs font-bold uppercase tracking-wide">{t('miniapp.flat.dayPrices')}</p>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('miniapp.flat.firstNight')} type="date" value={first} onChange={setFirst} />
            <Field label={t('miniapp.flat.lastNight')} type="date" value={last} onChange={setLast} />
          </div>
          <Field label={t('miniapp.flat.nightPrice')} inputMode="numeric" value={dayPrice} onChange={setDayPrice} />
          <div className="grid grid-cols-2 gap-2">
            <ActionButton tone="primary" disabled={busy} onClick={() => changeNights(false)}>
              {t('miniapp.flat.setNights')}
            </ActionButton>
            <ActionButton disabled={busy} onClick={() => changeNights(true)}>
              {t('miniapp.flat.clearNights')}
            </ActionButton>
          </div>
          {(priced.data ?? []).length > 0 && (
            <ul aria-label={t('miniapp.flat.dayPrices')} className="space-y-1 pt-1 text-sm">
              {priceRuns(priced.data ?? []).map((run) => (
                <li key={run.first} className="flex justify-between gap-2">
                  <span>{run.first === run.last ? day(run.first) : `${day(run.first)} – ${day(run.last)}`}</span>
                  <span className="font-semibold tabular-nums">{money(run.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm font-semibold">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  )
}
