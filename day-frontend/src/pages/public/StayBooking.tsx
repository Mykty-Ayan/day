import { useState } from 'react'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { parseISO } from 'date-fns'
import { MessageCircle, Minus, Plus, X } from 'lucide-react'
import { bookStay, type PublicOfferBooking, type PublicStay } from '../../api/public'
import { money } from '../../lib/public-stay'

/** wa.me with the flat and, once picked, the dates: the owner sees what is asked. */
function askLink(stay: PublicStay, text: string): string | null {
  const phone = stay.company?.whatsapp
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null
}

/** The bar at the foot of a flat's page: what the stay costs and the one next step. */
export function BookBar({
  stay,
  locale,
  quote,
  dates,
  onPickDates,
  onBook,
}: {
  stay: PublicStay
  locale: string
  quote: { total: number; count: number } | null
  dates: string | null
  onPickDates: () => void
  onBook: () => void
}) {
  const { t } = useTranslation()
  const ask = askLink(stay, t('guestStay.askText', { flat: stay.name, dates: dates ? ` — ${dates}` : '' }))
  // A flat let only by the hour has no nights to pick here: the guest writes instead.
  const byNight = stay.prices.night != null
  return (
    <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[640px] items-center justify-between gap-3 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="min-w-0">
          {quote ? (
            <>
              <span data-testid="bar-total" className="block text-lg font-bold">{money(quote.total, locale)}</span>
              <span className="block truncate text-sm text-gray-600">
                {dates} · {t('guest.nights', { count: quote.count })}
              </span>
            </>
          ) : stay.prices.night != null || stay.prices.hour != null ? (
            <>
              <span className="block text-lg font-bold">{money((stay.prices.night ?? stay.prices.hour)!, locale)}</span>
              <span className="block text-sm text-gray-600">
                {stay.prices.night != null ? t('guest.perNight') : t('guest.perHour')}
              </span>
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {ask && (
            <a
              href={ask}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('guestStay.ask')}
              title={t('guestStay.ask')}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 text-gray-800"
            >
              <MessageCircle className="h-5 w-5" aria-hidden />
            </a>
          )}
          {byNight && (
            <button
              type="button"
              onClick={quote ? onBook : onPickDates}
              className="h-12 rounded-xl bg-[var(--accent)] px-5 text-base font-semibold text-white"
            >
              {quote ? t('guestBook.book') : t('guestStay.pickDates')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function phoneOk(phone: string): boolean {
  const digits = phone.replace(/\D/g, '').length
  return digits >= 10 && digits <= 15
}

/** The guest's name, Kaspi number and party for the picked nights; the dates are then held. */
export function BookSheet({
  stay,
  locale,
  checkIn,
  checkOut,
  total,
  onClose,
  onBooked,
}: {
  stay: PublicStay
  locale: string
  checkIn: string
  checkOut: string
  total: number
  onClose: () => void
  onBooked: (booking: PublicOfferBooking) => void
}) {
  const { t } = useTranslation()
  const most = stay.max_guests ?? 50
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [guests, setGuests] = useState(Math.min(2, most))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  const phoneWrong = phone.length > 0 && !phoneOk(phone)

  async function send() {
    if (!name.trim() || !phoneOk(phone) || sending) {
      setError(!name.trim() ? t('guestStay.nameNeeded') : t('guestBook.phoneWrong'))
      return
    }
    setSending(true)
    setError(null)
    try {
      onBooked(await bookStay(stay.code, { check_in: checkIn, check_out: checkOut, guests, name: name.trim(), phone }))
    } catch (e) {
      const status = isAxiosError(e) ? e.response?.status : undefined
      // The server tells no reason on purpose: the dates were taken, or this number holds one already.
      setError(
        status === 409
          ? t('guestStay.refused')
          : status === 429
            ? t('guestStay.tooMany')
            : status === 422
              ? t('guestBook.refused')
              : t('guestBook.sendFailed'),
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-overlay flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        className="flex max-h-[92vh] w-full max-w-[640px] flex-col gap-4 overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="book-title" className="text-xl font-bold">{t('guestBook.title')}</h2>
            <p dir="auto" className="text-sm text-gray-600">
              {stay.name} · {day.format(parseISO(checkIn))} – {day.format(parseISO(checkOut))}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('guest.close')} className="flex h-11 w-11 items-center justify-center rounded-lg">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">{t('guestBook.name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
            autoFocus
            maxLength={255}
            className="h-12 rounded-xl border border-gray-300 px-3 text-base"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">{t('guestBook.phone')}</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            aria-invalid={phoneWrong}
            placeholder="+7 7__ ___ __ __"
            maxLength={50}
            className={`h-12 rounded-xl border px-3 text-base ${phoneWrong ? 'border-amber-600' : 'border-gray-300'}`}
          />
          <span className={`text-xs ${phoneWrong ? 'text-amber-800' : 'text-gray-500'}`}>
            {phoneWrong ? t('guestBook.phoneWrong') : t('guestBook.phoneHint')}
          </span>
        </label>
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

        <section className="flex flex-col gap-2 rounded-2xl bg-gray-50 p-4">
          {stay.prices.deposit != null && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-base font-semibold">{t('guestBook.depositNow')}</span>
              <span className="text-xl font-bold">{money(stay.prices.deposit, locale)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-gray-700">{t('guestBook.nightsLater', { nights: t('guest.nights', { count: Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86_400_000) }) })}</span>
            <span className="text-base font-semibold">{money(total, locale)}</span>
          </div>
          <p className="text-xs text-gray-500">{t('guest.totalHint')}</p>
        </section>

        {error && (
          <p role="alert" className="text-sm text-amber-800">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={send}
          disabled={sending}
          className="h-12 rounded-xl bg-[var(--accent)] text-base font-semibold text-white disabled:opacity-60"
        >
          {sending ? t('guestBook.booking') : t('guestBook.book')}
        </button>
        <p className="text-xs text-gray-500">{t('guestBook.holdNote')}</p>
      </div>
    </div>
  )
}

/** After booking: until when the dates are the guest's and what comes next. */
export function HeldView({ booking, locale }: { booking: PublicOfferBooking; locale: string }) {
  const { t } = useTranslation()
  const until = booking.expires_at
    ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(booking.expires_at))
    : null
  const deposit = booking.deposit != null ? money(booking.deposit, locale) : null
  return (
    <section className="flex flex-col gap-3 px-5 pb-10 pt-6" aria-live="polite">
      <h1 className="text-2xl font-bold leading-tight tracking-tight">
        {until ? t('guestBook.heldUntil', { time: until }) : t('guestBook.held')}
      </h1>
      <p className="text-base leading-relaxed text-gray-700">
        {deposit ? t('guestBook.invoice', { deposit, phone: booking.phone, time: until ?? '' }) : t('guestBook.noDeposit')}
      </p>
      {deposit && (
        <ol className="mt-1 flex flex-col gap-3">
          {[t('guestBook.step1'), t('guestBook.step2', { deposit }), t('guestBook.step3')].map((step, n) => (
            <li key={step} className="flex items-start gap-3 text-[15px] leading-normal">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold">{n + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      )}
      {booking.total != null && (
        <p className="text-sm text-gray-700">{t('guestBook.nightsAtCheckIn', { total: money(booking.total, locale) })}</p>
      )}
    </section>
  )
}
