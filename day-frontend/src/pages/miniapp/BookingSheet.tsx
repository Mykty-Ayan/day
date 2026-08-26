/**
 * Everything an operator does to a live booking, one thumb at a time:
 * check the guest in or out, take an extra night, record a payment, and hand
 * the guest the address and Wi-Fi without retyping any of it.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BedDouble, Copy, LogIn, LogOut, Send, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { addPayment, changeBookingStatus, listPayments, updateBooking } from '../../api/bookings'
import { getProperty } from '../../api/properties'
import type { Booking } from '../../types/booking'
import { copyText, openWhatsApp, resultFeedback } from '../../lib/telegram'
import { addDays, formatDay, formatMoney, toISODate } from './format'
import { buildCheckInMessage } from './messages'
import { ActionButton, Field, Sheet } from './miniapp-ui'

export default function BookingSheet({
  booking,
  onClose,
}: {
  booking: Booking | null
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const property = useQuery({
    queryKey: ['miniapp', 'property', booking?.property_id],
    queryFn: () => getProperty(booking!.property_id),
    enabled: Boolean(booking),
  })

  const payments = useQuery({
    queryKey: ['miniapp', 'payments', booking?.id],
    queryFn: () => listPayments(booking!.id),
    enabled: Boolean(booking),
  })

  const paid = (payments.data ?? []).reduce(
    (sum, payment) => sum + (payment.type === 'refund' ? -payment.amount : payment.amount),
    0,
  )
  const due = Math.max(0, (booking?.total_price ?? 0) - paid)

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['miniapp'] })
  }

  function fail(mutationError: unknown) {
    resultFeedback('error')
    const detail = (mutationError as { response?: { data?: { detail?: string } } }).response?.data
      ?.detail
    setError(detail || t('miniapp.loadFailed'))
  }

  const extend = useMutation({
    mutationFn: () => {
      const nextCheckOut = addDays(new Date(booking!.check_out), 1)
      const time = booking!.check_out.slice(11, 19) || '12:00:00'
      return updateBooking(booking!.id, { check_out: `${toISODate(nextCheckOut)}T${time}` })
    },
    onSuccess: () => {
      resultFeedback('success')
      refresh()
      onClose()
    },
    onError: fail,
  })

  const setStatus = useMutation({
    mutationFn: (status: 'checked_in' | 'checked_out') => changeBookingStatus(booking!.id, status),
    onSuccess: () => {
      resultFeedback('success')
      refresh()
      onClose()
    },
    onError: fail,
  })

  const pay = useMutation({
    mutationFn: () =>
      addPayment(booking!.id, {
        amount: Number(amount || due),
        type: 'payment',
        method: 'transfer',
      }),
    onSuccess: () => {
      resultFeedback('success')
      setAmount('')
      queryClient.invalidateQueries({ queryKey: ['miniapp', 'payments', booking?.id] })
      refresh()
    },
    onError: fail,
  })

  if (!booking) return null

  const checkInText = buildCheckInMessage(booking, property.data, i18n.language, t)

  return (
    <Sheet open title={booking.guest_name || booking.property_name} onClose={onClose}>
      <div className="tg-surface rounded-xl px-3 py-3">
        <p className="text-sm font-semibold">{booking.property_name}</p>
        <p className="tg-hint text-xs">
          {formatDay(booking.check_in, i18n.language)} → {formatDay(booking.check_out, i18n.language)}
          {booking.guest_phone ? ` · ${booking.guest_phone}` : ''}
        </p>
        <p className="mt-2 flex items-baseline justify-between text-sm">
          <span className="tg-hint">{t('miniapp.booking.due')}</span>
          <span className="font-bold">
            {formatMoney(due, i18n.language)} ₸
            <span className="tg-hint font-normal">
              {' '}
              / {formatMoney(booking.total_price, i18n.language)}
            </span>
          </span>
        </p>
      </div>

      {error && <p className="text-sm font-semibold">{error}</p>}

      <div className="grid grid-cols-2 gap-2">
        <ActionButton disabled={extend.isPending} onClick={() => extend.mutate()}>
          <BedDouble className="h-4 w-4" />
          {t('miniapp.booking.extend')}
        </ActionButton>

        {booking.status === 'checked_in' ? (
          <ActionButton disabled={setStatus.isPending} onClick={() => setStatus.mutate('checked_out')}>
            <LogOut className="h-4 w-4" />
            {t('miniapp.booking.checkOut')}
          </ActionButton>
        ) : (
          <ActionButton disabled={setStatus.isPending} onClick={() => setStatus.mutate('checked_in')}>
            <LogIn className="h-4 w-4" />
            {t('miniapp.booking.checkIn')}
          </ActionButton>
        )}
      </div>

      {due > 0 && (
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Field
            label={t('miniapp.booking.payment')}
            value={amount}
            onChange={setAmount}
            type="number"
            inputMode="numeric"
            placeholder={String(due)}
          />
          <ActionButton tone="primary" disabled={pay.isPending} onClick={() => pay.mutate()}>
            <Wallet className="h-4 w-4" />
            {t('miniapp.booking.record')}
          </ActionButton>
        </div>
      )}

      <pre className="tg-surface max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl p-3 text-xs">
        {checkInText}
      </pre>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <ActionButton
          tone="primary"
          onClick={() => openWhatsApp(booking.guest_phone ?? '', checkInText)}
        >
          <Send className="h-4 w-4" />
          {t('miniapp.booking.sendGuest')}
        </ActionButton>
        <ActionButton
          onClick={async () => {
            const ok = await copyText(checkInText)
            setCopied(ok)
            window.setTimeout(() => setCopied(false), 1500)
          }}
        >
          <Copy className="h-4 w-4" />
          {copied ? t('miniapp.copied') : t('miniapp.offer.copy')}
        </ActionButton>
      </div>
    </Sheet>
  )
}
