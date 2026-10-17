import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { addDays, format, parseISO } from 'date-fns'
import { isAxiosError } from 'axios'
import { BedDouble, Building2, Clock, Globe, KeyRound, LayoutGrid, MapPin, PlayCircle, Ruler, Users, X } from 'lucide-react'
import { getPublicStay, type PublicStay } from '../../api/public'
import { isDayBlocked } from '../../lib/booking-dates'
import { guestLanguage, monthCells, stayQuote, type GuestLanguage } from '../../lib/public-stay'

const LANGUAGES: { code: GuestLanguage; name: string; locale: string }[] = [
  { code: 'ru', name: 'Русский', locale: 'ru-RU' },
  { code: 'kz', name: 'Қазақша', locale: 'kk-KZ' },
  { code: 'en', name: 'English', locale: 'en-GB' },
]
// Two months on screen, one under the other, as a phone scrolls.
const WINDOW_NIGHTS = 62

function savedLanguage(): string | null {
  try {
    return localStorage.getItem('guest-language')
  } catch {
    return null
  }
}

function money(value: number, locale: string): string {
  return `${Math.round(value).toLocaleString(locale)} ₸`
}

/** A flat's page for guests, opened by its link with no sign-in: what the flat is,
 *  what a night costs and which nights are free. */
export default function PublicStayPage({ code }: { code: string }) {
  const { t, i18n } = useTranslation()
  const [language, setLanguage] = useState<GuestLanguage>(() =>
    guestLanguage(savedLanguage(), typeof navigator === 'undefined' ? null : navigator.language),
  )
  const [picking, setPicking] = useState(false)
  useEffect(() => {
    void i18n.changeLanguage(language)
    document.documentElement.lang = language === 'kz' ? 'kk' : language
  }, [i18n, language])
  const locale = LANGUAGES.find((l) => l.code === language)?.locale ?? 'ru-RU'

  const today = format(new Date(), 'yyyy-MM-dd')
  const until = format(addDays(new Date(), WINDOW_NIGHTS), 'yyyy-MM-dd')
  const stay = useQuery({
    queryKey: ['public-stay', code, today],
    queryFn: () => getPublicStay(code, today, until),
    retry: (count, error) => !(isAxiosError(error) && error.response?.status === 404) && count < 2,
  })

  function choose(next: GuestLanguage) {
    setLanguage(next)
    setPicking(false)
    try {
      localStorage.setItem('guest-language', next)
    } catch {
      // Private mode: the pick lasts for this visit.
    }
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-[640px]">
        <header className="flex h-14 items-center justify-end border-b border-gray-200 px-4">
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={`${t('guest.language')}: ${LANGUAGES.find((l) => l.code === language)?.name}`}
            className="flex h-11 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-semibold"
          >
            <Globe className="h-4 w-4" aria-hidden />
            {language.toUpperCase()}
          </button>
        </header>
        {stay.isPending && <p className="p-6 text-sm text-gray-500">{t('guest.loading')}</p>}
        {stay.isError && (
          <p className="p-6 text-base text-gray-700">
            {isAxiosError(stay.error) && stay.error.response?.status === 404 ? t('guest.notFound') : t('guest.failed')}
          </p>
        )}
        {stay.data && <StayView stay={stay.data} locale={locale} today={today} />}
      </div>
      {picking && (
        <div className="fixed inset-0 z-overlay flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setPicking(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('guest.language')}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-2xl bg-white p-4 sm:rounded-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-bold">{t('guest.language')}</h2>
              <button type="button" onClick={() => setPicking(false)} aria-label={t('guest.close')} className="flex h-11 w-11 items-center justify-center rounded-lg">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div role="radiogroup" aria-label={t('guest.language')} className="flex flex-col">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  role="radio"
                  aria-checked={l.code === language}
                  onClick={() => choose(l.code)}
                  className={`flex min-h-[48px] items-center justify-between rounded-xl px-3 text-left text-base ${l.code === language ? 'bg-emerald-50 font-semibold' : ''}`}
                >
                  {l.name}
                  {l.code === language && <span aria-hidden className="text-emerald-700">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StayView({ stay, locale, today }: { stay: PublicStay; locale: string; today: string }) {
  const { t } = useTranslation()
  const [photo, setPhoto] = useState(0)
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

  // From the state as it is now, not as this render saw it: two quick taps both count.
  function pick(day: string) {
    setStay((now) =>
      now.checkIn && !now.checkOut && day > now.checkIn
        ? { checkIn: now.checkIn, checkOut: day }
        : { checkIn: day, checkOut: null },
    )
  }

  const facts = [
    stay.max_guests ? { icon: Users, text: t('guest.guests', { count: stay.max_guests }) } : null,
    stay.rooms ? { icon: LayoutGrid, text: t('guest.rooms', { count: stay.rooms }) } : null,
    stay.beds ? { icon: BedDouble, text: t('guest.beds', { count: stay.beds }) } : null,
    stay.area_total ? { icon: Ruler, text: `${stay.area_total} м²` } : null,
    stay.floor != null
      ? {
          icon: Building2,
          text: stay.floors_total
            ? t('guest.floorOf', { floor: stay.floor, total: stay.floors_total })
            : t('guest.floor', { floor: stay.floor }),
        }
      : null,
  ].filter(Boolean) as { icon: typeof Users; text: string }[]

  return (
    <main>
      {stay.photos.length > 0 && (
        <section aria-label={t('guest.photos')} className="relative">
          <div
            className="flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto bg-gray-100"
            onScroll={(e) => setPhoto(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          >
            {stay.photos.map((url, n) => (
              <img key={url} src={url} alt={t('guest.photoOf', { n: n + 1, total: stay.photos.length })} loading={n === 0 ? 'eager' : 'lazy'} className="h-full w-full flex-none snap-center object-cover" />
            ))}
          </div>
          <span className="absolute bottom-3 right-3 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white">
            {photo + 1} / {stay.photos.length}
          </span>
        </section>
      )}

      <section className="flex flex-col gap-2 px-5 pt-5">
        {stay.complex_name && <span className="text-sm text-gray-600">{stay.complex_name}</span>}
        <h1 className="text-2xl font-bold leading-tight tracking-tight">{stay.name}</h1>
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

      {stay.prices.night != null && (
        <section aria-label={t('guest.price')} className="mx-5 mt-5 flex flex-col gap-2 rounded-2xl border border-gray-200 p-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tracking-tight">{money(stay.prices.night, locale)}</span>
            <span className="text-base text-gray-600">{t('guest.perNight')}</span>
          </div>
          {stay.prices.hour != null && <span className="text-base">{t('guest.hourly', { price: money(stay.prices.hour, locale) })}</span>}
          {stay.prices.deposit != null && (
            <span className="text-sm text-gray-600">{t('guest.deposit', { price: money(stay.prices.deposit, locale) })}</span>
          )}
        </section>
      )}

      {stay.nights.length > 0 && (
        <section className="flex flex-col gap-4 px-5 pt-7">
          <h2 className="text-xl font-bold">{t('guest.freeDates')}</h2>
          {months.map((month) => (
            <div key={month.getMonth()} className="flex flex-col gap-2">
              <h3 className="text-base font-semibold capitalize">
                {new Intl.DateTimeFormat(locale, { month: 'long' }).format(month)} {month.getFullYear()}
              </h3>
              <div className="grid grid-cols-7 text-center text-xs text-gray-600">
                {t('guest.weekdays').split(' ').map((d) => <span key={d}>{d}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {monthCells(month.getFullYear(), month.getMonth()).map((day, n) => {
                  if (!day) return <span key={`blank-${n}`} />
                  const disabled = day < today || isDayBlocked(day, taken, checkIn && !checkOut ? checkIn : null)
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
                      aria-label={`${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(parseISO(day))}${taken.has(day) && day >= today ? `, ${t('guest.taken')}` : ''}`}
                      className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-[15px] ${
                        edge ? 'bg-emerald-700 text-white' : inside ? 'bg-emerald-50' : ''
                      } ${disabled ? (day < today ? 'text-gray-300' : 'text-gray-400 line-through') : ''}`}
                    >
                      {Number(day.slice(8))}
                      {price != null && !edge && <span className="text-[10px] leading-none text-gray-600">{Math.round(price / 1000)}k</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 p-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">
                {checkIn && checkOut
                  ? `${format(parseISO(checkIn), 'dd.MM')} – ${format(parseISO(checkOut), 'dd.MM')}`
                  : checkIn
                    ? t('guest.pickCheckOut')
                    : t('guest.pickCheckIn')}
              </span>
              {quote && <span className="text-sm text-gray-600">{t('guest.nights', { count: quote.count })}</span>}
            </div>
            {quote && <span data-testid="stay-total" className="text-lg font-bold">{money(quote.total, locale)}</span>}
          </div>
        </section>
      )}

      {stay.description && (
        <section className="flex flex-col gap-2 px-5 pt-7">
          <h2 className="text-xl font-bold">{t('guest.about')}</h2>
          <p className="whitespace-pre-line text-base leading-relaxed">{stay.description}</p>
        </section>
      )}

      {stay.amenities.length > 0 && (
        <section className="flex flex-col gap-3 px-5 pt-7">
          <h2 className="text-xl font-bold">{t('guest.amenities')}</h2>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-[15px]">
            {stay.amenities.map((a) => <li key={a.name}>{a.name}</li>)}
          </ul>
        </section>
      )}

      {(stay.check_in_hour != null || stay.check_out_hour != null || stay.check_in_method) && (
        <section className="flex flex-col gap-3 px-5 pt-7">
          <h2 className="text-xl font-bold">{t('guest.checkInTitle')}</h2>
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
          {stay.check_in_method && (
            <p className="flex items-start gap-3 text-[15px] leading-normal">
              <KeyRound className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              {t('guest.checkInHow', { method: t(`properties.checkInMethod.${stay.check_in_method}`) })}
            </p>
          )}
          {stay.prices.hour != null && stay.rental_mode !== 'daily' && (
            <p className="flex items-start gap-3 text-[15px] leading-normal">
              <Clock className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              {t('guest.hourly', { price: money(stay.prices.hour, locale) })}
            </p>
          )}
        </section>
      )}

      {stay.house_rules && (
        <section className="flex flex-col gap-2 px-5 pt-7">
          <h2 className="text-xl font-bold">{t('guest.rules')}</h2>
          <p className="whitespace-pre-line text-base leading-relaxed">{stay.house_rules}</p>
        </section>
      )}

      <section className="flex flex-col gap-3 px-5 pt-7">
        <h2 className="text-xl font-bold">{t('guest.location')}</h2>
        {stay.complex_name && (
          <p className="flex items-center gap-2 text-base">
            <MapPin className="h-5 w-5" aria-hidden />
            {stay.complex_name}
          </p>
        )}
        <p className="text-sm text-gray-600">{t('guest.addressAfter')}</p>
        {stay.map_url && (
          <a href={stay.map_url} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center justify-center rounded-2xl border border-gray-900 text-[15px] font-semibold">
            {t('guest.openMap')}
          </a>
        )}
      </section>

      {stay.video_url && (
        <section className="px-5 pt-7">
          <a href={stay.video_url} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-gray-900 text-[15px] font-semibold">
            <PlayCircle className="h-5 w-5" aria-hidden />
            {t('guest.watchVideo')}
          </a>
        </section>
      )}

      <footer className="px-5 pb-10 pt-8 text-xs text-gray-500">{t('guest.poweredBy')}</footer>
    </main>
  )
}
