/**
 * Booking a free unit while the guest is still on the phone.
 *
 * The phone comes first: it finds a guest who stayed before and asks the
 * colleagues' blacklist before anything is saved. Dates, hours and the number
 * of guests come from "Sell"; the price is quoted for exactly that.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { calculatePrice, createBooking, listGuests } from '../../api/bookings'
import { checkBlacklist, type AvailableProperty } from '../../api/miniapp'
import { phoneDigits } from '../../lib/phone'
import { confirmAction, resultFeedback } from '../../lib/telegram'
import type { Booking, BookingCreateInput, BookingSource } from '../../types/booking'
import { paymentMaybeRecorded } from './booking-card'
import { errorText } from './errors'
import { formatDay, formatMoney, formatTime } from './format'
import { ActionButton, Chip, Field, Sheet } from './miniapp-ui'
import type { SellRange } from './sell'
import { useClosingConfirmation } from './useClosingConfirmation'

const SOURCES: BookingSource[] = ['direct', 'airbnb', 'booking', 'other']
const HOLD_HOURS = 2

export default function BookSheet({
  unit,
  range,
  onClose,
  onBooked,
}: {
  unit: AvailableProperty | null
  range: SellRange | null
  onClose: () => void
  onBooked: (booking: Booking) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const queryClient = useQueryClient()
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [source, setSource] = useState<BookingSource>('direct')
  const [hold, setHold] = useState(false)
  const [error, setError] = useState('')
  // The first press freezes the request, hold time included: a retry after a
  // lost answer must send the same body under the same key, or the server
  // refuses it and the booking already made is never shown.
  const [attempt, setAttempt] = useState<{ body: BookingCreateInput; key: string } | null>(null)
  useClosingConfirmation(Boolean(unit) && Boolean(name.trim() || phone.trim()))

  const open = Boolean(unit && range)
  const digits = phoneDigits(phone)
  const lookup = open && digits.length >= 11

  const known = useQuery({
    queryKey: ['miniapp', 'guest', digits],
    queryFn: () => listGuests({ phone: digits }),
    enabled: lookup,
    staleTime: 60_000,
  })
  const warning = useQuery({
    queryKey: ['miniapp', 'blacklist', digits],
    queryFn: () => checkBlacklist(digits),
    enabled: lookup,
    staleTime: 60_000,
  })
  const guest = known.data?.items[0]

  // The form resets by being remounted: the parent keys this component on the
  // unit, so picking another flat starts from a clean sheet.
  const quote = useQuery({
    queryKey: ['miniapp', 'quote', unit?.property_id, range],
    queryFn: () =>
      calculatePrice({
        property_id: unit!.property_id,
        check_in: range!.checkIn,
        check_out: range!.checkOut,
        adults_count: range!.guests,
        children_count: 0,
        rental_mode: range!.rentalMode,
      }),
    enabled: open,
  })

  // The server books an existing guest under the name already on file.
  const guestName = name.trim() || guest?.name || ''

  const book = useMutation({
    mutationFn: (frozen: { body: BookingCreateInput; key: string }) => createBooking(frozen.body, frozen.key),
    onSuccess: (created) => {
      setAttempt(null)
      resultFeedback('success')
      queryClient.invalidateQueries({ queryKey: ['miniapp'] })
      onBooked(created)
    },
    onError: (mutationError) => {
      resultFeedback('error')
      // A refusal means nothing was made; otherwise only the same request may follow.
      if (!paymentMaybeRecorded(mutationError)) {
        setAttempt(null)
        setError(errorText(mutationError, t('miniapp.book.failed'), t))
        return
      }
      // The booking may exist already: the lists must show it before anyone books this guest again.
      queryClient.invalidateQueries({ queryKey: ['miniapp'] })
      setError(t('miniapp.book.maybeMade'))
    },
  })

  async function askBook() {
    setError('')
    if (attempt) {
      book.mutate(attempt)
      return
    }
    // The answer for this very number, not whatever the field held a moment ago:
    // the server does not check the blacklist itself.
    if (digits.length >= 3) {
      let check: { warned: boolean }
      try {
        check = await queryClient.fetchQuery({
          queryKey: ['miniapp', 'blacklist', digits],
          queryFn: () => checkBlacklist(digits),
          staleTime: 60_000,
        })
      } catch {
        resultFeedback('error')
        setError(t('miniapp.book.checkFailed'))
        return
      }
      if (check.warned && !(await confirmAction(t('miniapp.book.warnedAsk')))) return
    }
    const frozen = {
      body: {
        property_id: unit!.property_id,
        guest_name: guestName,
        guest_phone: phone.trim(),
        check_in: range!.checkIn,
        check_out: range!.checkOut,
        rental_mode: range!.rentalMode,
        source,
        adults_count: range!.guests,
        children_count: 0,
        expires_at: hold ? new Date(Date.now() + HOLD_HOURS * 3_600_000).toISOString() : undefined,
      },
      key: crypto.randomUUID(),
    }
    setAttempt(frozen)
    book.mutate(frozen)
  }

  if (!unit || !range) return null

  // The flat's own hours, as availability reports them; the slot itself for hours.
  const from = unit.check_in ?? range.checkIn
  const to = unit.check_out ?? range.checkOut
  const when = (value: string) =>
    value.length > 10 ? `${formatDay(value, lang)} ${formatTime(value, lang)}` : formatDay(`${value}T12:00:00`, lang)

  return (
    <Sheet open title={unit.name} onClose={onClose}>
      <div className="tg-surface rounded-xl px-3 py-3">
        <div className="flex items-baseline justify-between">
          <span className="tg-hint text-xs font-bold uppercase tracking-wide">{t('miniapp.book.total')}</span>
          <span className="text-lg font-bold">
            {quote.data ? `${formatMoney(quote.data.total, lang)} ₸` : quote.isError ? t('miniapp.noPrice') : '…'}
          </span>
        </div>
        <p className="tg-hint mt-1 text-xs">
          {when(from)} → {when(to)} · {t('miniapp.book.guests', { count: range.guests })}
        </p>
      </div>

      <Field
        label={t('miniapp.book.guestPhone')}
        value={phone}
        onChange={setPhone}
        disabled={Boolean(attempt)}
        type="tel"
        inputMode="tel"
        placeholder="+7 701 000 00 00"
      />

      {warning.data?.warned && (
        <p role="alert" className="flex gap-2 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {warning.data.message}
        </p>
      )}

      {guest && (
        <p className="tg-surface rounded-xl px-3 py-2 text-xs">
          {t('miniapp.book.known', { name: guest.name })}
        </p>
      )}

      <Field
        label={t('miniapp.book.guestName')}
        value={name}
        onChange={setName}
        disabled={Boolean(attempt)}
        placeholder={guest?.name || t('miniapp.book.namePlaceholder')}
      />

      <div>
        <p className="tg-hint mb-1 text-xs font-bold uppercase tracking-wide">{t('miniapp.book.source')}</p>
        <div className="flex gap-1">
          {SOURCES.map((value) => (
            <Chip
              key={value}
              label={t(`bookings.sources.${value}`)}
              active={source === value}
              onClick={() => !attempt && setSource(value)}
            />
          ))}
        </div>
      </div>

      <label className="tg-surface flex items-start gap-3 rounded-xl px-3 py-3 text-sm">
        <input
          type="checkbox"
          checked={hold}
          disabled={Boolean(attempt)}
          onChange={(event) => setHold(event.target.checked)}
          className="mt-1"
        />
        <span>
          {t('miniapp.book.hold', { count: HOLD_HOURS })}
          <span className="tg-hint block text-xs">{t('miniapp.book.holdHint', { count: HOLD_HOURS })}</span>
        </span>
      </label>

      {error && (
        <p role="alert" className="text-sm font-semibold">
          {error}
        </p>
      )}

      <ActionButton tone="primary" disabled={!guestName || book.isPending} onClick={askBook}>
        <CalendarCheck className="h-4 w-4" />
        {book.isPending ? t('miniapp.book.saving') : attempt ? t('miniapp.book.retry') : t('miniapp.book.confirm')}
      </ActionButton>
    </Sheet>
  )
}
