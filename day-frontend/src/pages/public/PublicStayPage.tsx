import { useMemo, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { addDays, format, parseISO } from 'date-fns'
import { BedDouble, Building2, KeyRound, LayoutGrid, MapPin, Ruler, Users, X } from 'lucide-react'
import { getPublicStay, type PublicOfferBooking, type PublicStay } from '../../api/public'
import { isDayBlocked } from '../../lib/booking-dates'
import { money, monthCells, onAccent, retryNetwork, stayQuote } from '../../lib/public-stay'
import { GuestFrame, LoadFailed } from './GuestFrame'
import { BookBar, BookSheet, HeldView } from './StayBooking'

// Day's own green when the company has no color of its own.
const DEFAULT_ACCENT = '#047857'

// Two months on screen, one under the other, as a phone scrolls.
const WINDOW_NIGHTS = 62
// The guest does it themselves: no lock and no code to send.
const SELF_CHECK_IN = ['lockbox', 'keypad', 'smart_lock']

/** A flat's page for guests, opened by its link with no sign-in: what the flat is,
 *  what a night costs and which nights are free. */
export default function PublicStayPage({ code }: { code: string }) {
  return <GuestFrame>{(locale) => <Stay code={code} locale={locale} />}</GuestFrame>
}

function Stay({ code, locale }: { code: string; locale: string }) {
  const { t } = useTranslation()
  const today = format(new Date(), 'yyyy-MM-dd')
  const until = format(addDays(new Date(), WINDOW_NIGHTS), 'yyyy-MM-dd')
  const stay = useQuery({
    queryKey: ['public-stay', code, today],
    queryFn: () => getPublicStay(code, today, until),
    retry: retryNetwork,
  })

  return (
    <>
      {stay.isPending && <p className="p-6 text-sm text-gray-500">{t('guest.loading')}</p>}
      {/* A refresh that fails later keeps the page the guest has. */}
      {stay.isError && !stay.data && (
        <LoadFailed error={stay.error} onRetry={() => void stay.refetch()} gone={{ 404: t('guest.notFound') }} />
      )}
      {stay.data && <StayView stay={stay.data} locale={locale} today={today} />}
    </>
  )
}

function StayView({ stay, locale, today }: { stay: PublicStay; locale: string; today: string }) {
  const { t } = useTranslation()
  const [photo, setPhoto] = useState(0)
  // The photo open on the whole screen, by its place in the list.
  const [zoomed, setZoomed] = useState<number | null>(null)
  const [booking, setBooking] = useState(false)
  const [held, setHeld] = useState<PublicOfferBooking | null>(null)
  const [{ checkIn, checkOut }, setStay] = useState<{ checkIn: string | null; checkOut: string | null }>({
    checkIn: null,
    checkOut: null,
  })

  // A night is taken if the page has it as taken; one it has not loaded counts as taken too.
  const free = useMemo(() => new Set(stay.nights.filter((n) => n.free).map((n) => n.date)), [stay.nights])
  const taken = useMemo(() => {
    const set = new Set(stay.nights.filter((n) => !n.free).map((n) => n.date))
    const last = stay.nights.at(-1)?.date
    if (last) set.add(format(addDays(parseISO(last), 1), 'yyyy-MM-dd'))
    return set
  }, [stay.nights])
  const prices = useMemo(() => new Map(stay.nights.map((n) => [n.date, n.price])), [stay.nights])
  const months = useMemo(() => {
    const first = parseISO(today)
    return [0, 1].map((n) => new Date(first.getFullYear(), first.getMonth() + n, 1))
  }, [today])
  const quote = checkIn && checkOut ? stayQuote(stay.nights, checkIn, checkOut) : null

  const dayLabel = useMemo(() => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }), [locale])
  const shortDay = useMemo(() => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }), [locale])
  const monthName = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'long' }), [locale])
  const short = !quote || stay.min_nights == null || quote.count >= stay.min_nights ? null : stay.min_nights

  // From the state as it is now, not as this render saw it: two quick taps both
  // count. A day past the next taken night cannot end the stay: it starts a new one.
  function pick(day: string) {
    setStay((now) =>
      now.checkIn && !now.checkOut && day > now.checkIn && !isDayBlocked(day, taken, now.checkIn)
        ? { checkIn: now.checkIn, checkOut: day }
        : { checkIn: day, checkOut: null },
    )
  }

  const facts = [
    stay.max_guests ? { icon: Users, text: t('guest.guests', { count: stay.max_guests }) } : null,
    stay.rooms ? { icon: LayoutGrid, text: t('guest.rooms', { count: stay.rooms }) } : null,
    stay.beds ? { icon: BedDouble, text: t('guest.beds', { count: stay.beds }) } : null,
    stay.area_total ? { icon: Ruler, text: t('guest.area', { area: stay.area_total.toLocaleString(locale) }) } : null,
    stay.floor != null
      ? {
          icon: Building2,
          text: stay.floors_total
            ? t('guest.floorOf', { floor: stay.floor, total: stay.floors_total })
            : t('guest.floor', { floor: stay.floor }),
        }
      : null,
  ].filter(Boolean) as { icon: typeof Users; text: string }[]

  const color = stay.company?.accent_color ?? DEFAULT_ACCENT
  const accent = { '--accent': color, '--on-accent': onAccent(color) } as CSSProperties
  const datesText = checkIn && checkOut ? `${shortDay.format(parseISO(checkIn))} – ${shortDay.format(parseISO(checkOut))}` : null
  const bookable = quote && short == null ? quote : null

  if (held) {
    return (
      <main style={accent}>
        <HeldView booking={held} locale={locale} />
      </main>
    )
  }

  return (
    <main style={accent} className={stay.company ? 'pb-24' : undefined}>
      {stay.company && (
        <a href={`/c/${stay.company.slug}`} className="flex items-center gap-2.5 border-b border-gray-100 px-5 py-2.5">
          {stay.company.logo_url && <img src={stay.company.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" />}
          <span dir="auto" className="min-w-0 truncate text-sm font-semibold text-gray-800">{stay.company.title}</span>
          <span className="ms-auto text-sm font-semibold text-[var(--accent)]">{t('guestStay.allFlats')}</span>
        </a>
      )}
      {stay.photos.length > 0 && (
        <section aria-label={t('guest.photos')} className="relative">
          <div
            className="flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto bg-gray-100"
            // Right to left, the scroll runs below zero.
            onScroll={(e) => setPhoto(Math.round(Math.abs(e.currentTarget.scrollLeft) / e.currentTarget.clientWidth))}
          >
            {stay.photos.map((url, n) => (
              <button key={url} type="button" onClick={() => setZoomed(n)} className="h-full w-full flex-none snap-center">
                <img src={url} alt={t('guest.photoOf', { n: n + 1, total: stay.photos.length })} loading={n === 0 ? 'eager' : 'lazy'} fetchPriority={n === 0 ? 'high' : 'auto'} decoding="async" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
          <span dir="ltr" className="absolute bottom-3 end-3 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white">
            {photo + 1} / {stay.photos.length}
          </span>
        </section>
      )}

      <section className="flex flex-col gap-2 px-5 pt-5">
        {/* The owner's words, in their language: their own direction on a right-to-left page. */}
        {stay.complex_name && <span dir="auto" className="text-sm text-gray-600">{stay.complex_name}</span>}
        <h1 dir="auto" className="text-2xl font-bold leading-tight tracking-tight">{stay.name}</h1>
      </section>

      {facts.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 px-5 pt-4">
          {facts.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2.5 rounded-2xl bg-gray-50 p-3 text-sm">
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
      )}

      {(stay.prices.night != null || stay.prices.hour != null) && (
        <section aria-label={t('guest.price')} className="mx-5 mt-5 flex flex-col gap-2 rounded-2xl border border-gray-200 p-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tracking-tight">{money((stay.prices.night ?? stay.prices.hour)!, locale)}</span>
            <span className="text-base text-gray-600">{stay.prices.night != null ? t('guest.perNight') : t('guest.perHour')}</span>
          </div>
          {stay.prices.night != null && stay.prices.hour != null && (
            <span className="text-base">{t('guest.hourly', { price: money(stay.prices.hour, locale) })}</span>
          )}
          {stay.prices.night != null && stay.min_nights != null && stay.min_nights > 1 && (
            <span className="text-sm text-gray-600">{t('guest.minNights', { count: stay.min_nights })}</span>
          )}
          {stay.prices.deposit != null && (
            <span className="text-sm text-gray-600">
              {/* Next to the deposit for hours, the nightly one says which it is. */}
              {t(stay.prices.hour_deposit != null ? 'guest.nightDeposit' : 'guest.deposit', {
                price: money(stay.prices.deposit, locale),
              })}
            </span>
          )}
          {stay.prices.hour_deposit != null && (
            <span className="text-sm text-gray-600">
              {t('guest.hourDeposit', { price: money(stay.prices.hour_deposit, locale) })}
            </span>
          )}
        </section>
      )}

      {stay.nights.length > 0 && (
        <section id="dates" className="flex flex-col gap-4 px-5 pt-7">
          <h2 className="text-xl font-bold">{t('guest.freeDates')}</h2>
          {months.map((month) => (
            <div key={month.getMonth()} className="flex flex-col gap-2">
              <h3 className="text-base font-semibold capitalize">
                {monthName.format(month)} {month.getFullYear()}
              </h3>
              <div className="grid grid-cols-7 text-center text-xs text-gray-600">
                {t('guest.weekdays').split(' ').map((d) => <span key={d}>{d}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {monthCells(month.getFullYear(), month.getMonth()).map((day, n) => {
                  if (!day) return <span key={`blank-${n}`} />
                  // Past the next taken night a free day is not a check-out, but it can start a new stay.
                  const disabled =
                    day < today || (isDayBlocked(day, taken, checkIn && !checkOut ? checkIn : null) && taken.has(day))
                  const edge = day === checkIn || day === checkOut
                  const inside = checkIn && checkOut && day > checkIn && day < checkOut
                  const price = free.has(day) && day >= today ? prices.get(day) : undefined
                  return (
                    <button
                      key={day}
                      type="button"
                      data-night={day}
                      disabled={disabled}
                      onClick={() => pick(day)}
                      aria-pressed={Boolean(edge || inside)}
                      aria-label={`${dayLabel.format(parseISO(day))}${taken.has(day) && day >= today ? `, ${t('guest.taken')}` : ''}`}
                      className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[15px] ${
                        edge ? 'bg-[var(--accent)] text-[var(--on-accent)]' : inside ? 'bg-gray-100' : ''
                      } ${disabled ? (day < today ? 'text-gray-300' : 'text-gray-400 line-through') : ''}`}
                    >
                      {Number(day.slice(8))}
                      {price != null && !edge && (
                        <span className="text-[10px] leading-none text-gray-600">
                          {(price / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })}k
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <div aria-live="polite" className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 p-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">
                {checkIn && checkOut
                  ? `${shortDay.format(parseISO(checkIn))} – ${shortDay.format(parseISO(checkOut))}`
                  : checkIn
                    ? t('guest.pickCheckOut')
                    : t('guest.pickCheckIn')}
              </span>
              {quote && <span className="text-sm text-gray-600">{t('guest.nights', { count: quote.count })}</span>}
            </div>
            {quote && short == null && <span data-testid="stay-total" className="text-lg font-bold">{money(quote.total, locale)}</span>}
            {short != null && <span className="text-end text-sm font-semibold text-amber-800">{t('guest.minNights', { count: short })}</span>}
          </div>
          {quote && short == null && <p className="text-xs text-gray-500">{t('guest.totalHint')}</p>}
        </section>
      )}

      {stay.description && (
        <section className="flex flex-col gap-2 px-5 pt-7">
          <h2 className="text-xl font-bold">{t('guest.about')}</h2>
          <p dir="auto" className="whitespace-pre-line text-base leading-relaxed">{stay.description}</p>
        </section>
      )}

      {stay.amenities.length > 0 && (
        <section className="flex flex-col gap-3 px-5 pt-7">
          <h2 className="text-xl font-bold">{t('guest.amenities')}</h2>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-[15px]">
            {stay.amenities.map((a) => <li key={a.name} dir="auto">{a.name}</li>)}
          </ul>
        </section>
      )}

      {(stay.rental_mode !== 'hourly' || stay.check_in_method) && (
        <section className="flex flex-col gap-3 px-5 pt-7">
          <h2 className="text-xl font-bold">{t('guest.checkInTitle')}</h2>
          {stay.rental_mode !== 'hourly' && (
          <div className="grid grid-cols-2 gap-2">
            {stay.check_in_hour != null && (
              <div className="flex flex-col gap-1 rounded-2xl bg-gray-50 p-3.5">
                <span className="text-sm text-gray-600">{t('guest.checkIn')}</span>
                <span className="text-lg font-bold">{t('guest.from', { hour: stay.check_in_hour })}</span>
              </div>
            )}
            {stay.check_out_hour != null && (
              <div className="flex flex-col gap-1 rounded-2xl bg-gray-50 p-3.5">
                <span className="text-sm text-gray-600">{t('guest.checkOut')}</span>
                <span className="text-lg font-bold">{t('guest.until', { hour: stay.check_out_hour })}</span>
              </div>
            )}
          </div>
          )}
          {stay.check_in_method && (
            <p className="flex items-start gap-3 text-[15px] leading-normal">
              <KeyRound className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              {SELF_CHECK_IN.includes(stay.check_in_method)
                ? t('guest.checkInHow', { method: t(`properties.checkInMethod.${stay.check_in_method}`) })
                : t(`properties.checkInMethod.${stay.check_in_method}`)}
            </p>
          )}
        </section>
      )}

      {stay.house_rules && (
        <section className="flex flex-col gap-2 px-5 pt-7">
          <h2 className="text-xl font-bold">{t('guest.rules')}</h2>
          <p dir="auto" className="whitespace-pre-line text-base leading-relaxed">{stay.house_rules}</p>
        </section>
      )}

      <section className="flex flex-col gap-3 px-5 pt-7">
        <h2 className="text-xl font-bold">{t('guest.location')}</h2>
        {stay.complex_name && (
          <p className="flex items-center gap-2 text-base">
            <MapPin className="h-5 w-5" aria-hidden />
            <span dir="auto">{stay.complex_name}</span>
          </p>
        )}
        <p className="text-sm text-gray-600">{t('guest.addressAfter')}</p>
      </section>

      <footer className="px-5 pb-10 pt-8 text-xs text-gray-500">{t('guest.poweredBy')}</footer>

      {stay.company && (
        <BookBar
          stay={stay}
          locale={locale}
          quote={bookable}
          dates={datesText}
          canPickDates={stay.nights.length > 0}
          onPickDates={() => document.getElementById('dates')?.scrollIntoView({ behavior: 'smooth' })}
          onBook={() => setBooking(true)}
        />
      )}
      {booking && bookable && checkIn && checkOut && (
        <BookSheet
          stay={stay}
          locale={locale}
          checkIn={checkIn}
          checkOut={checkOut}
          total={bookable.total}
          onClose={() => setBooking(false)}
          onBooked={(made) => {
            setBooking(false)
            setHeld(made)
            window.scrollTo(0, 0)
          }}
        />
      )}
      {zoomed !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('guest.photos')}
          onKeyDown={(e) => e.key === 'Escape' && setZoomed(null)}
          className="fixed inset-0 z-overlay flex flex-col bg-black"
        >
          <div className="flex items-center justify-between p-3 text-white">
            <span dir="ltr" className="text-sm">{zoomed + 1} / {stay.photos.length}</span>
            <button type="button" autoFocus onClick={() => setZoomed(null)} aria-label={t('guest.close')} className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div
            // Opened on the photo tapped, once: later scrolling is the guest's.
            ref={(el) => {
              if (el && !el.dataset.opened) {
                el.dataset.opened = '1'
                el.scrollTo({ left: zoomed * el.clientWidth * (document.documentElement.dir === 'rtl' ? -1 : 1) })
              }
            }}
            onScroll={(e) => setZoomed(Math.round(Math.abs(e.currentTarget.scrollLeft) / e.currentTarget.clientWidth))}
            className="flex flex-1 snap-x snap-mandatory overflow-x-auto"
          >
            {stay.photos.map((url, n) => (
              <img key={url} src={url} alt={t('guest.photoOf', { n: n + 1, total: stay.photos.length })} className="h-full w-full flex-none snap-center object-contain" />
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
