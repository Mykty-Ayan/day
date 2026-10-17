import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { parseISO } from 'date-fns'
import { ArrowLeft, Minus, Plus } from 'lucide-react'
import {
  bookFromOffer,
  getPublicStay,
  type PublicOffer,
  type PublicOfferBooking,
  type PublicOfferFlat,
} from '../../api/public'
import { phoneDigits } from '../../lib/phone'
import { money, retryNetwork, stayDates } from '../../lib/public-stay'

// The server's word for a flat taken meanwhile; any other 409 is the link's own booking.
const TAKEN = 'The flat is taken for these dates'

/** Booking one flat of the link: the guest checks the name, the number the Kaspi
 *  invoice goes to and the guests; Day holds the dates for 30 minutes. */
export function BookForm({
  offer,
  flat,
  locale,
  onBack,
  onBooked,
  onStale,
}: {
  offer: PublicOffer
  flat: PublicOfferFlat
  locale: string
  onBack: () => void
  onBooked: (booking: PublicOfferBooking) => void
  /** The link has a booking already, or the flat went: the page reloads the link. */
  onStale: () => void
}) {
  const { t } = useTranslation()
  // The flat's own page: its deposit, hours and house rules.
  const stay = useQuery({
    queryKey: ['public-stay', flat.code, offer.check_in, offer.check_out],
    queryFn: () => getPublicStay(flat.code, offer.check_in, offer.check_out),
    retry: retryNetwork,
  })
  const most = flat.max_guests ?? 50
  const [name, setName] = useState(offer.guest ?? '')
  // null: the invoice goes to the number from the chat.
  const [otherPhone, setOtherPhone] = useState<string | null>(null)
  const [guests, setGuests] = useState(Math.min(offer.guests, most))
  const [agreed, setAgreed] = useState(false)
  const rules = stay.data?.house_rules
  const deposit = stay.data?.prices.deposit ?? null
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })

  const book = useMutation({
    mutationFn: () =>
      bookFromOffer(offer.code, {
        flat: flat.code,
        guests,
        // The link's own name and number are Day's: only a change is sent.
        ...(name.trim() && name.trim() !== offer.guest ? { name: name.trim() } : {}),
        ...(otherPhone !== null ? { phone: otherPhone } : {}),
      }),
    onSuccess: onBooked,
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 409 && error.response.data?.detail !== TAKEN) onStale()
    },
  })
  const status = isAxiosError(book.error) ? book.error.response?.status : undefined
  const refusal = !book.error
    ? null
    : status === 409
      ? t('guestBook.taken')
      : status === 410
        ? t('guestOffer.expired')
        : status === 422 || status === 404
          ? t('guestBook.refused')
          : t('guest.failed')
  const ready = (!rules || agreed) && (otherPhone === null || phoneDigits(otherPhone).length >= 10) && !book.isPending

  return (
    <main className="flex flex-col gap-5 px-5 pb-10 pt-4">
      <button type="button" onClick={onBack} className="flex h-11 items-center gap-2 self-start text-sm font-semibold">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('guestBook.back')}
      </button>
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold leading-tight tracking-tight">{t('guestBook.title')}</h1>
        <p className="text-base text-gray-700">{flat.name}</p>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1 rounded-2xl bg-gray-50 p-3.5">
          <span className="text-sm text-gray-600">{t('guest.checkIn')}</span>
          <span className="text-base font-bold">
            {day.format(parseISO(offer.check_in))}
            {stay.data?.check_in_hour != null && `, ${t('guest.from', { hour: stay.data.check_in_hour })}`}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl bg-gray-50 p-3.5">
          <span className="text-sm text-gray-600">{t('guest.checkOut')}</span>
          <span className="text-base font-bold">
            {day.format(parseISO(offer.check_out))}
            {stay.data?.check_out_hour != null && `, ${t('guest.until', { hour: stay.data.check_out_hour })}`}
          </span>
        </div>
      </div>

      <p className="text-sm text-gray-600">{t('guestBook.fromChat')}</p>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">{t('guestBook.name')}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="given-name"
          maxLength={255}
          className="h-12 rounded-xl border border-gray-300 px-3 text-base"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">{t('guestBook.phone')}</span>
        {otherPhone === null ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-base">{offer.phone}</span>
            <button type="button" onClick={() => setOtherPhone('')} className="h-11 px-1 text-sm font-semibold text-emerald-800">
              {t('guestBook.otherPhone')}
            </button>
          </div>
        ) : (
          <input
            value={otherPhone}
            onChange={(e) => setOtherPhone(e.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            autoFocus
            aria-label={t('guestBook.phone')}
            placeholder="+7 7__ ___ __ __"
            maxLength={50}
            className="h-12 rounded-xl border border-gray-300 px-3 text-base"
          />
        )}
        <span className="text-xs text-gray-500">{otherPhone === null ? t('guestBook.phoneHidden') : t('guestBook.phoneHint')}</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{t('guestBook.guests')}</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setGuests((n) => Math.max(1, n - 1))}
            disabled={guests <= 1}
            aria-label={t('guestBook.fewer')}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-300 disabled:opacity-40"
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <span aria-live="polite" className="w-6 text-center text-lg font-bold">{guests}</span>
          <button
            type="button"
            onClick={() => setGuests((n) => Math.min(most, n + 1))}
            disabled={guests >= most}
            aria-label={t('guestBook.more')}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-300 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <section className="flex flex-col gap-2 rounded-2xl border border-gray-200 p-4">
        {deposit != null && (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-base font-semibold">{t('guestBook.depositNow')}</span>
              <span data-testid="deposit" className="text-xl font-bold">{money(deposit, locale)}</span>
            </div>
            <p className="text-sm text-gray-600">{t('guestBook.depositWhy')}</p>
          </>
        )}
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-gray-700">{t('guestBook.nightsLater', { nights: t('guest.nights', { count: offer.nights }) })}</span>
          {flat.total != null && guests === offer.guests && <span className="text-base font-semibold">{money(flat.total, locale)}</span>}
        </div>
        {guests !== offer.guests && <p className="text-xs text-gray-500">{t('guestBook.totalAfter')}</p>}
      </section>

      {rules && (
        <details className="rounded-2xl bg-gray-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold">{t('guest.rules')}</summary>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{rules}</p>
        </details>
      )}
      {rules && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5" />
          {t('guestBook.agree')}
        </label>
      )}

      {refusal && (
        <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {refusal}
        </p>
      )}
      <button
        type="button"
        onClick={() => book.mutate()}
        disabled={!ready}
        className="h-14 rounded-2xl bg-emerald-700 text-base font-bold text-white disabled:opacity-50"
      >
        {book.isPending ? t('guestBook.booking') : t('guestBook.book')}
      </button>
      <p className="text-xs leading-relaxed text-gray-500">{t('guestBook.holdNote')}</p>
    </main>
  )
}

/** The link's booking: until when the dates are held and what to pay, or that the
 *  stay is confirmed. */
export function Waiting({ offer, booking, locale }: { offer: PublicOffer; booking: PublicOfferBooking; locale: string }) {
  const { t } = useTranslation()
  const flat = offer.flats.find((f) => f.code === booking.flat)
  const until = booking.expires_at
    ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(booking.expires_at))
    : null
  const deposit = booking.deposit != null ? money(booking.deposit, locale) : null
  const dates = stayDates(locale, offer.check_in, offer.check_out)

  return (
    <main className="flex flex-col gap-5 px-5 pb-10 pt-5">
      {booking.status === 'pending' ? (
        <section className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold leading-tight tracking-tight">
            {until ? t('guestBook.heldUntil', { time: until }) : t('guestBook.held')}
          </h1>
          <p className="text-base leading-relaxed text-gray-700">
            {deposit
              ? t('guestBook.invoice', { deposit, phone: booking.phone, time: until ?? '' })
              : t('guestBook.noDeposit')}
          </p>
          {deposit && (
            <ol className="mt-2 flex flex-col gap-3">
              {[t('guestBook.step1'), t('guestBook.step2', { deposit }), t('guestBook.step3')].map((step, n) => (
                <li key={step} className="flex items-start gap-3 text-[15px] leading-normal">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-800">
                    {n + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : (
        <section className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold leading-tight tracking-tight">{t('guestBook.confirmed')}</h1>
          <p className="text-base leading-relaxed text-gray-700">{t('guestBook.confirmedNext')}</p>
        </section>
      )}

      <section className="flex flex-col gap-1 rounded-2xl border border-gray-200 p-4">
        {flat && <h2 className="text-base font-bold">{flat.name}</h2>}
        <p className="text-sm text-gray-600">
          {dates} · {t('guest.nights', { count: offer.nights })} · {t('guestOffer.guests', { count: booking.guests })}
        </p>
        {booking.total != null && (
          <p className="text-sm text-gray-700">{t('guestBook.nightsAtCheckIn', { total: money(booking.total, locale) })}</p>
        )}
      </section>
    </main>
  )
}
