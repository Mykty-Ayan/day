/**
 * Changing a booking from the phone: dates, the party, the price and a note.
 * A price typed in is money, so it is confirmed first; new dates on a price the
 * system worked out ask whether to reprice, as the web edit does.
 */

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { calculatePrice, updateBooking } from '../../api/bookings'
import { stayRuleBreaches, stayRuleText } from '../../lib/booking-errors'
import { wouldReprice } from '../../lib/booking-dates'
import { confirmAction, resultFeedback } from '../../lib/telegram'
import type { Booking, BookingUpdateInput } from '../../types/booking'
import type { StayRuleBreach } from '../../lib/booking-errors'
import { editPatch, formFromBooking, type EditForm } from './booking-edit'
import { errorText } from './errors'
import { formatMoney } from './format'
import { ActionButton, Field, Sheet } from './miniapp-ui'
import { useClosingConfirmation } from './useClosingConfirmation'

export default function EditBookingSheet({
  booking,
  onClose,
  onSaved,
}: {
  booking: Booking
  onClose: () => void
  onSaved: () => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<EditForm>(() => formFromBooking(booking))
  const [error, setError] = useState('')
  const [quoting, setQuoting] = useState(false)
  // What was sent and refused by the flat's rules; "save anyway" resends it.
  const [refused, setRefused] = useState<{ patch: BookingUpdateInput; breaches: StayRuleBreach[] } | null>(null)
  const [choice, setChoice] = useState<{ patch: BookingUpdateInput; was: number; now: number } | null>(null)
  const hourly = booking.rental_mode === 'hourly'
  const money = (value: number) => `${formatMoney(value, i18n.language)} ₸`

  const result = editPatch(booking, form)
  const dirty = 'patch' in result && Object.keys(result.patch).length > 0
  useClosingConfirmation(dirty)

  const save = useMutation({
    mutationFn: (patch: BookingUpdateInput) => updateBooking(booking.id, patch),
    onSuccess: () => {
      resultFeedback('success')
      queryClient.invalidateQueries({ queryKey: ['miniapp'] })
      onSaved()
    },
    onError: (mutationError, patch) => {
      resultFeedback('error')
      const breaches = stayRuleBreaches(mutationError)
      setRefused(breaches ? { patch, breaches } : null)
      if (!breaches) setError(errorText(mutationError, t('miniapp.loadFailed'), t))
    },
  })

  function change(field: keyof EditForm, value: string) {
    // An answer about the old form says nothing about the new one.
    setRefused(null)
    setChoice(null)
    setError('')
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function submit() {
    if ('error' in result) {
      setError(t(`miniapp.edit.errors.${result.error}`))
      return
    }
    const { patch } = result
    if (Object.keys(patch).length === 0) {
      onClose()
      return
    }
    if (patch.total_price !== undefined) {
      const ok = await confirmAction(
        t('miniapp.edit.priceAsk', { was: money(booking.total_price), now: money(patch.total_price) }),
      )
      if (ok) save.mutate(patch)
      return
    }
    if (wouldReprice(booking, patch)) {
      setQuoting(true)
      try {
        const quote = await calculatePrice({
          property_id: booking.property_id,
          check_in: patch.check_in ?? booking.check_in,
          check_out: patch.check_out ?? booking.check_out,
          adults_count: patch.adults_count ?? booking.adults_count,
          children_count: patch.children_count ?? booking.children_count,
          rental_mode: booking.rental_mode,
        })
        if (Number(quote.total) !== Number(booking.total_price)) {
          setChoice({ patch, was: Number(booking.total_price), now: Number(quote.total) })
          return
        }
      } catch {
        // No quote is no reason to stop the save; the server prices it as before.
      } finally {
        setQuoting(false)
      }
    }
    save.mutate(patch)
  }

  const busy = save.isPending || quoting

  return (
    <Sheet open title={t('miniapp.edit.title')} onClose={onClose}>
      <div className="space-y-3">
        {hourly ? (
          <>
            <Field label={t('miniapp.edit.day')} type="date" value={form.day} onChange={(v) => change('day', v)} />
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('miniapp.edit.start')} type="time" value={form.start} onChange={(v) => change('start', v)} />
              <Field label={t('miniapp.edit.end')} type="time" value={form.end} onChange={(v) => change('end', v)} />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('miniapp.edit.checkIn')} type="date" value={form.checkIn} onChange={(v) => change('checkIn', v)} />
            <Field label={t('miniapp.edit.checkOut')} type="date" value={form.checkOut} onChange={(v) => change('checkOut', v)} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('miniapp.edit.adults')} inputMode="numeric" value={form.adults} onChange={(v) => change('adults', v)} />
          <Field label={t('miniapp.edit.children')} inputMode="numeric" value={form.children} onChange={(v) => change('children', v)} />
        </div>
        <Field label={t('miniapp.edit.price')} inputMode="numeric" value={form.price} onChange={(v) => change('price', v)} />
        <label className="block">
          <span className="tg-hint mb-1 block text-xs font-bold uppercase tracking-wide">{t('miniapp.edit.notes')}</span>
          <textarea
            value={form.notes}
            rows={3}
            onChange={(event) => change('notes', event.target.value)}
            className="tg-surface w-full rounded-xl px-3 py-2 text-sm outline-none"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm font-semibold">
            {error}
          </p>
        )}

        {refused && (
          <div role="alert" className="tg-surface space-y-2 rounded-xl px-3 py-3">
            <p className="text-sm font-semibold">{t('bookings.stayRules.title')}</p>
            <ul className="list-disc space-y-0.5 pl-5 text-sm">
              {refused.breaches.map((breach) => (
                <li key={breach.rule}>{stayRuleText(breach, t)}</li>
              ))}
            </ul>
            <ActionButton disabled={busy} onClick={() => save.mutate({ ...refused.patch, override_rules: true })}>
              {t('miniapp.edit.saveAnyway')}
            </ActionButton>
          </div>
        )}

        {choice ? (
          <div role="alert" className="tg-surface space-y-2 rounded-xl px-3 py-3">
            <p className="text-sm">{t('bookings.priceChoice.ask', { now: money(choice.now), was: money(choice.was) })}</p>
            <ActionButton tone="primary" disabled={busy} onClick={() => save.mutate(choice.patch)}>
              {t('bookings.priceChoice.reprice', { now: money(choice.now) })}
            </ActionButton>
            <ActionButton disabled={busy} onClick={() => save.mutate({ ...choice.patch, total_price: choice.was })}>
              {t('bookings.priceChoice.keep', { was: money(choice.was) })}
            </ActionButton>
          </div>
        ) : (
          !refused && (
            <ActionButton tone="primary" disabled={busy} onClick={submit}>
              <Save className="h-4 w-4" />
              {busy ? t('miniapp.loading') : t('miniapp.edit.save')}
            </ActionButton>
          )
        )}
      </div>
    </Sheet>
  )
}
