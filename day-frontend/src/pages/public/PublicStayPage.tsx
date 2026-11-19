import { useMemo, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { addDays, format, parseISO } from 'date-fns'
import { BedDouble, Building2, ChevronLeft, Images, KeyRound, LayoutGrid, MapPin, Ruler, Share2, Users, X } from 'lucide-react'
import { getPublicStay, type PublicOfferBooking, type PublicStay } from '../../api/public'
import { isDayBlocked } from '../../lib/booking-dates'
import { amenityIcon } from '../../lib/amenity-icons'
import { MASK } from '../../lib/clarity'
import { fromThisWeek, money, monthCells, onAccent, openedInFlat, retryNetwork, stayQuote } from '../../lib/public-stay'
import { GuestFrame, LoadFailed } from './GuestFrame'
import { BookBar, BookSheet, HeldView } from './StayBooking'
import { StayHereBanner } from './StayHere'

// Day's own green when the company has no color of its own.
const DEFAULT_ACCENT = '#047857'

// Two months on screen, one under the other, as a phone scrolls.
const WINDOW_NIGHTS = 62
// The guest does it themselves: no lock and no code to send.
const SELF_CHECK_IN = ['lockbox', 'keypad', 'smart_lock']
// Enough amenities to tell the flat, the rest a tap away.
const AMENITIES_SHOWN = 6
// The approved guest mockup (28.10): white cards on a light grey page.
const CARD = 'm-2 rounded-[28px] bg-white p-5'
const H2 = 'font-guest-display text-[22px] font-bold tracking-[-0.025em]'
const MUTE = 'text-[#76767F]'
// A round button over the photo, glass on whatever the photo is.
const GLASS = 'flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-white/20 text-white backdrop-blur-md'

/** A flat's page for guests, opened by its link with no sign-in: what the flat is,
 *  what a night costs and which nights are free. */
export default function PublicStayPage({ code }: { code: string }) {
  return <GuestFrame overlay>{(locale) => <Stay code={code} locale={locale} />}</GuestFrame>
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
      {stay.isPending && <p className="p-6 text-sm text-[#76767F]">{t('guest.loading')}</p>}
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
  const [gallery, setGallery] = useState(false)
  const [allAmenities, setAllAmenities] = useState(false)
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
  // The company's weekend nights by name in the guest's language ("Sat, Sun"): the weekend
  // tariff prices are for them. 2 Nov 2026 is a Monday, the server's 0.
  const weekendLabel = useMemo(() => {
    const name = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    return (stay.prices.weekend_nights ?? [4, 5]).map((night) => name.format(new Date(2026, 10, 2 + night))).join(', ')
  }, [locale, stay.prices.weekend_nights])
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
      <main style={accent} {...MASK}>
        <HeldView booking={held} locale={locale} />
      </main>
    )
  }

  // The first free night from `from` on, for the quick picks.
  const firstFree = (from: string) => stay.nights.find((n) => n.free && n.date >= from)?.date ?? null
  const quickStart = checkIn ?? firstFree(today)
  // A quick pick of n nights from the picked check-in (or the first free night): every night free.
  const quickRange = (n: number) => {
    if (!quickStart) return null
    const out = format(addDays(parseISO(quickStart), n), 'yyyy-MM-dd')
    for (let d = quickStart; d < out; d = format(addDays(parseISO(d), 1), 'yyyy-MM-dd')) if (!free.has(d)) return null
    return { checkIn: quickStart, checkOut: out }
  }
  const tiles = facts.slice(0, 6)

  return (
    <main style={accent} className={`min-h-screen bg-[#EDEDF2] text-[#111114] ${stay.company ? 'pb-28' : 'pb-4'}`}>
      <div className="mx-auto max-w-[480px]">
        {/* The flat in a rounded frame, its name over the photo, as the approved mockup (28.10). */}
        <section aria-label={t('guest.photos')} className={`relative m-2 overflow-hidden rounded-[34px] bg-[#D9D9E0] ${stay.photos.length > 0 ? 'h-[480px]' : 'h-[260px]'}`}>
          {stay.photos.length > 0 && (
            <div
              className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
              // Right to left, the scroll runs below zero.
              onScroll={(e) => setPhoto(Math.round(Math.abs(e.currentTarget.scrollLeft) / e.currentTarget.clientWidth))}
            >
              {stay.photos.map((url, n) => (
                <button key={url} type="button" onClick={() => setZoomed(n)} className="h-full w-full flex-none snap-center">
                  <img src={url} alt={t('guest.photoOf', { n: n + 1, total: stay.photos.length })} loading={n === 0 ? 'eager' : 'lazy'} fetchPriority={n === 0 ? 'high' : 'auto'} decoding="async" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,0)_25%,rgba(0,0,0,0)_50%,rgba(0,0,0,.6))]" aria-hidden />
          {/* The language picker floats at the top end (GuestFrame overlay); these take the start. */}
          <div className="absolute start-3.5 top-3.5 z-10 flex gap-2">
            {stay.company && (
              <a href={`/c/${stay.company.slug}`} aria-label={t('guestStay.allFlats')} className={GLASS}>
                <ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden />
              </a>
            )}
            <ShareButton title={stay.name} />
          </div>
          <div className="absolute inset-x-5 bottom-5 z-10 text-white">
            {stay.complex_name && (
              <span dir="auto" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/30 bg-white/20 px-3.5 text-sm font-semibold backdrop-blur-md">
                <MapPin className="h-4 w-4" aria-hidden />
                {stay.complex_name}
              </span>
            )}
            <div className="mt-3 flex items-end justify-between gap-2.5">
              <h1 dir="auto" className="font-guest-display min-w-0 flex-1 text-[36px] font-bold leading-[1.02] tracking-[-0.035em]">{stay.name}</h1>
              {stay.photos.length > 1 && (
                <button type="button" onClick={() => setGallery(true)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-semibold text-[#111114]">
                  <Images className="h-4 w-4" aria-hidden />
                  {t('guest.allPhotos', { count: stay.photos.length })}
                </button>
              )}
            </div>
          </div>
          {stay.photos.length > 1 && (
            <span dir="ltr" className="sr-only" aria-live="polite">{photo + 1} / {stay.photos.length}</span>
          )}
        </section>

        {/* Opened from a tag or a QR code in the flat: the guest staying now opens their booking. */}
        {openedInFlat(window.location.search) && <StayHereBanner code={stay.code} whatsapp={stay.company?.whatsapp ?? null} />}

        {(stay.prices.night != null || stay.prices.hour != null || !!stay.prices.tariffs?.length) && (
          <section aria-label={t('guest.price')} className={`${CARD} flex flex-col gap-2`}>
            {(stay.prices.night != null || stay.prices.hour != null) && (
              <div className="flex items-baseline gap-1.5">
                <span className="text-[30px] font-bold tracking-[-0.03em]">{money((stay.prices.night ?? stay.prices.hour)!, locale)}</span>
                <span className={`text-base ${MUTE}`}>{stay.prices.night != null ? t('guest.perNight') : t('guest.perHour')}</span>
              </div>
            )}
            {!!stay.prices.tariffs?.length && (
              <div className="flex flex-col gap-1">
                <span className={`text-sm font-semibold ${MUTE}`}>{t('guest.tariffs')}</span>
                {stay.prices.tariffs.map((tariff) => (
                  <span key={tariff.name} className="text-base">
                    {t(`guest.tariff_${tariff.name}`)} — {money(tariff.price, locale)}
                    {tariff.weekend != null && (
                      <span className={MUTE}>{` · ${t('guest.tariffWeekend', { days: weekendLabel, price: money(tariff.weekend, locale) })}`}</span>
                    )}
                  </span>
                ))}
                {stay.prices.late_from && (
                  <span className={`text-sm ${MUTE}`}>{t('guest.lateRule', { late: stay.prices.late_from, morning: stay.prices.night_to })}</span>
                )}
              </div>
            )}
            {stay.prices.night != null && stay.prices.hour != null && (
              <span className="text-base">{t('guest.hourly', { price: money(stay.prices.hour, locale) })}</span>
            )}
            {stay.prices.night != null && stay.min_nights != null && stay.min_nights > 1 && (
              <span className={`text-sm ${MUTE}`}>{t('guest.minNights', { count: stay.min_nights })}</span>
            )}
            {stay.prices.deposit != null && (
              <span className={`text-sm ${MUTE}`}>
                {/* Next to the deposit for hours, the nightly one says which it is. */}
                {t(stay.prices.hour_deposit != null ? 'guest.nightDeposit' : 'guest.deposit', { price: money(stay.prices.deposit, locale) })}
              </span>
            )}
            {stay.prices.hour_deposit != null && (
              <span className={`text-sm ${MUTE}`}>{t('guest.hourDeposit', { price: money(stay.prices.hour_deposit, locale) })}</span>
            )}
          </section>
        )}

        {tiles.length > 0 && (
          <ul className="m-2 grid grid-cols-3 gap-2">
            {tiles.map(({ icon: Icon, text }) => (
              <li key={text} className="flex flex-col gap-3 rounded-[24px] bg-white px-3.5 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111114] text-white">
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <span className="text-[15px] font-semibold leading-tight">{text}</span>
              </li>
            ))}
          </ul>
        )}

        {stay.nights.length > 0 && (
          <section id="dates" className={`${CARD} flex scroll-mt-4 flex-col gap-4`}>
            <h2 className={H2}>{t('guest.freeDates')}</h2>
            {stay.prices.night != null && (
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none]">
                {[1, 2, 3, 7].map((n) => {
                  const range = quickRange(n)
                  const on = range && checkIn === range.checkIn && checkOut === range.checkOut
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={!range || (stay.min_nights != null && n < stay.min_nights)}
                      aria-pressed={Boolean(on)}
                      onClick={() => range && setStay(range)}
                      className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold disabled:opacity-40 ${on ? 'bg-[#111114] text-white' : 'bg-[#F3F3F6]'}`}
                    >
                      {t('guest.nights', { count: n })}
                    </button>
                  )
                })}
              </div>
            )}
            {months.map((month) => (
              <div key={month.getMonth()} className="flex flex-col gap-2">
                <h3 className="text-[15px] font-semibold capitalize">
                  {monthName.format(month)} {month.getFullYear()}
                </h3>
                <div className={`grid grid-cols-7 text-center text-xs ${MUTE}`}>
                  {t('guest.weekdays').split(' ').map((d) => <span key={d}>{d}</span>)}
                </div>
                <div className="grid grid-cols-7 gap-y-1.5">
                  {fromThisWeek(monthCells(month.getFullYear(), month.getMonth()), today).map((day, n) => {
                    if (!day) return <span key={`blank-${n}`} />
                    // Past the next taken night a free day is not a check-out, but it can start a new stay.
                    const disabled = day < today || (isDayBlocked(day, taken, checkIn && !checkOut ? checkIn : null) && taken.has(day))
                    const edge = day === checkIn || day === checkOut
                    const inside = Boolean(checkIn && checkOut && day > checkIn && day < checkOut)
                    const band = inside || (checkIn && checkOut && edge)
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
                        className="relative flex h-[54px] flex-col items-center justify-start"
                      >
                        {band && (
                          <span
                            aria-hidden
                            className={`absolute top-0 h-10 bg-[color-mix(in_srgb,var(--accent)_16%,white)] ${
                              day === checkIn ? 'inset-x-0 start-1/2' : day === checkOut ? 'inset-x-0 end-1/2' : 'inset-x-0'
                            }`}
                          />
                        )}
                        <span
                          className={`relative z-[1] flex h-10 w-10 items-center justify-center rounded-full text-[15px] font-medium ${
                            edge
                              ? 'bg-[var(--accent)] font-bold text-[var(--on-accent)]'
                              : inside
                                ? 'font-bold text-[var(--accent)]'
                                : disabled
                                  ? day < today
                                    ? 'text-[#C3C3CB]'
                                    : 'text-[#C3C3CB] line-through'
                                  : 'bg-[#F3F3F6]'
                          }`}
                        >
                          {Number(day.slice(8))}
                        </span>
                        {price != null && !edge && (
                          <span className={`mt-0.5 text-[10px] leading-none ${MUTE}`}>
                            {(price / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })}k
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            <div aria-live="polite" className="flex items-center justify-between gap-3 rounded-2xl bg-[color-mix(in_srgb,var(--accent)_12%,white)] px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold">
                  {checkIn && checkOut
                    ? `${shortDay.format(parseISO(checkIn))} – ${shortDay.format(parseISO(checkOut))}`
                    : checkIn
                      ? t('guest.pickCheckOut')
                      : t('guest.pickCheckIn')}
                </span>
                {quote && <span className={`text-sm ${MUTE}`}>{t('guest.nights', { count: quote.count })}</span>}
              </div>
              {quote && short == null && <span data-testid="stay-total" className="text-lg font-bold">{money(quote.total, locale)}</span>}
              {short != null && <span className="text-end text-sm font-semibold text-[#8A5A00]">{t('guest.minNights', { count: short })}</span>}
            </div>
            {quote && short == null && <p className={`text-xs ${MUTE}`}>{t('guest.totalHint')}</p>}
          </section>
        )}

        {stay.amenities.length > 0 && (
          <section className={CARD}>
            <h2 className={H2}>{t('guest.amenities')}</h2>
            <ul className="mt-3.5 grid grid-cols-2 gap-2">
              {(allAmenities ? stay.amenities : stay.amenities.slice(0, AMENITIES_SHOWN)).map((a) => {
                const Icon = amenityIcon(a.name, a.category)
                return (
                  <li key={a.name} className="flex items-center gap-2.5 rounded-[20px] bg-[#F3F3F6] p-3.5 text-sm font-medium leading-tight">
                    <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-white">
                      <Icon className="h-[17px] w-[17px]" aria-hidden />
                    </span>
                    <span dir="auto">{a.name}</span>
                  </li>
                )
              })}
            </ul>
            {!allAmenities && stay.amenities.length > AMENITIES_SHOWN && (
              <button type="button" onClick={() => setAllAmenities(true)} className="mt-2.5 h-12 w-full rounded-full bg-[#F3F3F6] text-sm font-semibold">
                {t('guest.allAmenities', { count: stay.amenities.length })}
              </button>
            )}
          </section>
        )}

        {stay.description && (
          <section className={`${CARD} flex flex-col gap-2`}>
            <h2 className={H2}>{t('guest.about')}</h2>
            <LongText text={stay.description} />
          </section>
        )}

        {(stay.rental_mode !== 'hourly' || stay.check_in_method) && (
          <section className={`${CARD} flex flex-col gap-3`}>
            <h2 className={H2}>{t('guest.checkInTitle')}</h2>
            {stay.rental_mode !== 'hourly' && (
              <div className="grid grid-cols-2 gap-2">
                {stay.check_in_hour != null && (
                  <div className="flex flex-col gap-1 rounded-[20px] bg-[#F3F3F6] p-4">
                    <span className={`text-sm ${MUTE}`}>{t('guest.checkIn')}</span>
                    <span className="text-lg font-bold">{t('guest.from', { hour: stay.check_in_hour })}</span>
                  </div>
                )}
                {stay.check_out_hour != null && (
                  <div className="flex flex-col gap-1 rounded-[20px] bg-[#F3F3F6] p-4">
                    <span className={`text-sm ${MUTE}`}>{t('guest.checkOut')}</span>
                    <span className="text-lg font-bold">{t('guest.until', { hour: stay.check_out_hour })}</span>
                  </div>
                )}
              </div>
            )}
            {stay.check_in_method && (
              <p className="flex items-start gap-3 text-[15px] leading-normal">
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#F3F3F6]">
                  <KeyRound className="h-[17px] w-[17px]" aria-hidden />
                </span>
                <span className="pt-1.5">
                  {SELF_CHECK_IN.includes(stay.check_in_method)
                    ? t('guest.checkInHow', { method: t(`properties.checkInMethod.${stay.check_in_method}`) })
                    : t(`properties.checkInMethod.${stay.check_in_method}`)}
                </span>
              </p>
            )}
          </section>
        )}

        {stay.house_rules && (
          <section className={`${CARD} flex flex-col gap-2`}>
            <h2 className={H2}>{t('guest.rules')}</h2>
            <LongText text={stay.house_rules} />
          </section>
        )}

        <section className={`${CARD} flex flex-col gap-3`}>
          <h2 className={H2}>{t('guest.location')}</h2>
          <div className="flex items-start gap-3 rounded-[20px] bg-[#F3F3F6] p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[var(--accent)]">
              <MapPin className="h-5 w-5" aria-hidden />
            </span>
            <div className="flex flex-col gap-0.5">
              {stay.complex_name && <span dir="auto" className="text-base font-semibold">{stay.complex_name}</span>}
              <span className={`text-sm ${MUTE}`}>{t('guest.addressAfter')}</span>
            </div>
          </div>
        </section>

        <footer className={`px-6 pb-6 pt-4 text-xs ${MUTE}`}>{t('guest.poweredBy')}</footer>
      </div>

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
      {gallery && (
        <div role="dialog" aria-modal="true" aria-label={t('guest.photos')} onKeyDown={(e) => e.key === 'Escape' && setGallery(false)} className="fixed inset-0 z-overlay overflow-y-auto bg-white">
          <div className="sticky top-0 z-10 flex items-center justify-between bg-white/90 px-4 py-2 backdrop-blur">
            <span className="text-base font-bold">{t('guest.allPhotos', { count: stay.photos.length })}</span>
            <button type="button" autoFocus onClick={() => setGallery(false)} aria-label={t('guest.close')} className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F3F3F6]">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          {/* Each photo at its own shape, two columns: the flat at a glance, as a board of pins. */}
          <div className="columns-2 gap-2 px-2 pb-8 sm:columns-3">
            {stay.photos.map((url, n) => (
              <button key={url} type="button" onClick={() => setZoomed(n)} className="mb-2 block w-full break-inside-avoid overflow-hidden rounded-2xl bg-[#F3F3F6]">
                <img src={url} alt={t('guest.photoOf', { n: n + 1, total: stay.photos.length })} loading="lazy" decoding="async" className="w-full" />
              </button>
            ))}
          </div>
        </div>
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

// Long owner's text (about, rules): a few lines, the rest a tap away.
const CLAMP_CHARS = 280

function LongText({ text }: { text: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const long = text.length > CLAMP_CHARS
  return (
    <>
      <p dir="auto" className={`whitespace-pre-line text-base leading-[1.55] text-[#2A2A30] ${long && !open ? 'line-clamp-4' : ''}`}>
        {text}
      </p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="h-11 self-start text-[15px] font-semibold underline underline-offset-4">
          {open ? t('guest.showLess') : t('guest.readMore')}
        </button>
      )}
    </>
  )
}

// The flat's own link, never the one from a tag in the flat (?nfc): a friend gets the listing.
function ShareButton({ title }: { title: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  async function share() {
    const url = `${window.location.origin}${window.location.pathname}`
    try {
      if (navigator.share) {
        await navigator.share({ title, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // The guest closed the share sheet, or the browser refused: nothing to undo.
    }
  }
  return (
    <>
      <button type="button" onClick={() => void share()} aria-label={t('guest.share')} className={GLASS}>
        <Share2 className="h-[18px] w-[18px]" aria-hidden />
      </button>
      {copied && (
        <span role="status" className="fixed inset-x-0 top-4 z-overlay mx-auto w-fit rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {t('guest.linkCopied')}
        </span>
      )}
    </>
  )
}
