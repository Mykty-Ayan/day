/**
 * Everything an operator does to a live booking, one thumb at a time:
 * check the guest in or out, take an extra night, record a payment, and hand
 * the guest the address and Wi-Fi without retyping any of it.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BedDouble, CheckCircle2, Copy, LogIn, LogOut, Send, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { addPayment, changeBookingStatus, getBooking, listPayments, updateBooking } from '../../api/bookings'
import { getProperty } from '../../api/properties'
import type { Booking, BookingStatus } from '../../types/booking'
import { copyText, openWhatsApp, resultFeedback } from '../../lib/telegram'
import { addDays, formatDay, formatMoney, toISODate } from './format'
import DepositRow from './DepositRow'
import { errorText } from './errors'
import { buildCheckInMessage } from './messages'
import { ActionButton, Field, Sheet } from './miniapp-ui'

/** The single legal step forward from each status.
 *
 *  The backend refuses to skip a link — pending goes to confirmed, never
 *  straight to checked_in — so offering a fixed "Заселить" button turned into
 *  an error the moment a booking was taken by phone. */
const NEXT_STEP: Partial<
  Record<BookingStatus, { status: BookingStatus; labelKey: string; Icon: typeof LogIn }>
> = {
  pending: { status: 'confirmed', labelKey: 'miniapp.booking.confirm', Icon: CheckCircle2 },
  confirmed: { status: 'checked_in', labelKey: 'miniapp.booking.checkIn', Icon: LogIn },
  checked_in: { status: 'checked_out', labelKey: 'miniapp.booking.checkOut', Icon: LogOut },
  checked_out: { status: 'completed', labelKey: 'miniapp.booking.complete', Icon: CheckCircle2 },
}

export default function BookingSheet({
  booking: opened,
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

  // A row from a list is a snapshot: a payment confirms a pending booking, a
  // status change moves it. The card works on the booking as the server has it.
  const fresh = useQuery({
    queryKey: ['miniapp', 'booking', opened?.id],
    queryFn: async () => (await getBooking(opened!.id)).booking,
    enabled: Boolean(opened),
    // Someone else (the CRM, the web) may have moved it since the last look.
    staleTime: 0,
    refetchOnMount: 'always',
  })
  const booking = fresh.data ?? opened
  // Acting on an old status sends a transition the server refuses.
  const settling = fresh.isFetching

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

  // Only money that arrived: a pending payment (the CRM records one before the
  // transfer lands) must not hide the debt.
  const paid = (payments.data ?? [])
    .filter((payment) => payment.status === 'completed')
    .reduce((sum, payment) => sum + (payment.type === 'refund' ? -payment.amount : payment.amount), 0)
  const due = Math.max(0, (booking?.total_price ?? 0) - paid)

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['miniapp'] })
  }

  function fail(mutationError: unknown) {
    resultFeedback('error')
    setError(errorText(mutationError, t('miniapp.loadFailed'), t))
  }

  const extend = useMutation({
    mutationFn: () => {
      const nextCheckOut = addDays(new Date(booking!.check_out), 1)
      const time = booking!.check_out.slice(11, 19) || '12:00:00'
      return updateBooking(booking!.id, { check_out: `${toISODate(nextCheckOut)}T${time}` })
    },
    onSuccess: () => {
      resultFeedback('success')
      setError('')
      refresh()
      onClose()
    },
    onError: fail,
  })

  const setStatus = useMutation({
    mutationFn: (status: BookingStatus) => changeBookingStatus(booking!.id, status),
    onSuccess: () => {
      resultFeedback('success')
      setError('')
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
      setError('')
      setAmount('')
      queryClient.invalidateQueries({ queryKey: ['miniapp', 'payments', booking?.id] })
      refresh()
    },
    onError: fail,
  })

  if (!booking) return null

  const next = NEXT_STEP[booking.status]
  const checkInText = buildCheckInMessage(booking, property.data, i18n.language, t)

  return (
    <Sheet open title={booking.guest_name || booking.property_name} onClose={onClose}>
      {booking.overbooking && (
        <p role="alert" className="rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white">
          {t('bookings.overbooking.detail')}
        </p>
      )}
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
        <ActionButton disabled={settling || extend.isPending} onClick={() => extend.mutate()}>
          <BedDouble className="h-4 w-4" />
          {t('miniapp.booking.extend')}
        </ActionButton>

        {next && (
          <ActionButton disabled={settling || setStatus.isPending} onClick={() => setStatus.mutate(next.status)}>
            <next.Icon className="h-4 w-4" />
            {t(next.labelKey)}
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
          <ActionButton tone="primary" disabled={settling || pay.isPending} onClick={() => pay.mutate()}>
            <Wallet className="h-4 w-4" />
            {t('miniapp.booking.record')}
          </ActionButton>
        </div>
      )}

      <DepositRow bookingId={booking.id} suggestedAmount={booking.total_price} onError={fail} />

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
