/**
 * Booking a free unit while the guest is still on the phone.
 *
 * Name and phone are the only things the operator has to type; dates come from
 * the availability screen and the price is quoted before anything is saved.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { calculatePrice, createBooking } from '../../api/bookings'
import type { AvailableProperty } from '../../api/miniapp'
import { resultFeedback } from '../../lib/telegram'
import { formatMoney } from './format'
import { ActionButton, Field, Sheet } from './miniapp-ui'

export default function BookSheet({
  unit,
  checkIn,
  checkOut,
  onClose,
}: {
  unit: AvailableProperty | null
  checkIn: string
  checkOut: string
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  // The form resets by being remounted: the parent keys this component on the
  // unit, so picking another flat starts from a clean sheet without an effect
  // racing the first render.
  const quote = useQuery({
    queryKey: ['miniapp', 'quote', unit?.property_id, checkIn, checkOut],
    queryFn: () =>
      calculatePrice({
        property_id: unit!.property_id,
        check_in: checkIn,
        check_out: checkOut,
        adults_count: 2,
        children_count: 0,
      }),
    enabled: Boolean(unit),
  })

  const book = useMutation({
    mutationFn: () =>
      createBooking({
        property_id: unit!.property_id,
        guest_name: name.trim(),
        guest_phone: phone.trim(),
        check_in: checkIn,
        check_out: checkOut,
        source: 'direct',
        adults_count: 2,
        children_count: 0,
      }),
    onSuccess: () => {
      resultFeedback('success')
      queryClient.invalidateQueries({ queryKey: ['miniapp'] })
      onClose()
    },
    onError: (mutationError) => {
      resultFeedback('error')
      const detail = (mutationError as { response?: { data?: { detail?: string } } }).response?.data
        ?.detail
      setError(detail || t('miniapp.book.failed'))
    },
  })

  return (
    <Sheet open={Boolean(unit)} title={unit?.name ?? ''} onClose={onClose}>
      <div className="tg-surface flex items-baseline justify-between rounded-xl px-3 py-3">
        <span className="tg-hint text-xs font-bold uppercase tracking-wide">
          {t('miniapp.book.total')}
        </span>
        <span className="text-lg font-bold">
          {quote.data
            ? `${formatMoney(quote.data.total, i18n.language)} ₸`
            : quote.isError
              ? t('miniapp.noPrice')
              : '…'}
        </span>
      </div>

      {quote.data && quote.data.nights > 0 && (
        <p className="tg-hint text-xs">
          {t('miniapp.book.nights', { count: quote.data.nights })}
        </p>
      )}

      <Field label={t('miniapp.book.guestName')} value={name} onChange={setName} placeholder="Ерлан" />
      <Field
        label={t('miniapp.book.guestPhone')}
        value={phone}
        onChange={setPhone}
        type="tel"
        inputMode="tel"
        placeholder="+7 701 000 00 00"
      />

      {error && <p className="text-sm font-semibold">{error}</p>}

      <ActionButton
        tone="primary"
        disabled={!name.trim() || book.isPending}
        onClick={() => {
          setError('')
          book.mutate()
        }}
      >
        <CalendarCheck className="h-4 w-4" />
        {book.isPending ? t('miniapp.book.saving') : t('miniapp.book.confirm')}
      </ActionButton>
    </Sheet>
  )
}
