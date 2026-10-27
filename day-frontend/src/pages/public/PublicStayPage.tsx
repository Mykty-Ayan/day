import { useMemo, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { addDays, format, parseISO } from 'date-fns'
import { BedDouble, Building2, ChevronLeft, Images, KeyRound, LayoutGrid, MapPin, Ruler, Share2, Users, X } from 'lucide-react'
import { getPublicStay, type PublicOfferBooking, type PublicStay } from '../../api/public'
import { isDayBlocked } from '../../lib/booking-dates'
import { amenityIcon } from '../../lib/amenity-icons'
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
const AMENITIES_SHOWN = 8

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
      {/* The flat edge to edge, the way a listing opens on a phone; the text slides over it as a sheet. */}
      <section aria-label={t('guest.photos')} className="relative bg-stone-200">
        {stay.photos.length > 0 ? (
          <div
            className="flex aspect-[4/5] max-h-[72vh] w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
            // Right to left, the scroll runs below zero.
            onScroll={(e) => setPhoto(Math.round(Math.abs(e.currentTarget.scrollLeft) / e.currentTarget.clientWidth))}
          >
            {stay.photos.map((url, n) => (
              <button key={url} type="button" onClick={() => setZoomed(n)} className="h-full w-full flex-none snap-center">
                <img src={url} alt={t('guest.photoOf', { n: n + 1, total: stay.photos.length })} loading={n === 0 ? 'eager' : 'lazy'} fetchPriority={n === 0 ? 'high' : 'auto'} decoding="async" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : (
          <div className="aspect-[16/9] w-full" aria-hidden />
        )}
        {/* The language picker floats at the top end (GuestFrame overlay); these take the start. */}
        <div className="absolute start-0 top-0 z-10 flex h-16 items-center gap-2 px-4">
          {stay.company && (
            <a href={`/c/${stay.company.slug}`} aria-label={t('guestStay.allFlats')} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white ring-1 ring-white/25 backdrop-blur-md">
              <ChevronLeft className="h-5 w-5 rtl:rotate-180" aria-hidden />
            </a>
          )}
          <ShareButton title={stay.name} />
        </div>
        {stay.photos.length > 1 && (
          <div className="absolute inset-x-0 bottom-12 flex items-center justify-between px-4">
            <button type="button" onClick={() => setGallery(true)} className="flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold bg-black/30 text-white ring-1 ring-white/25 backdrop-blur-md">
              <Images className="h-4 w-4" aria-hidden />
              {t('guest.allPhotos', { count: stay.photos.length })}
            </button>
            <span dir="ltr" className="rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md">
              {photo + 1} / {stay.photos.length}
            </span>
          </div>
        )}
      </section>

      <section className="relative -mt-8 flex flex-col gap-2 rounded-t-[32px] bg-white px-5 pt-6">
        {/* The owner's words, in their language: their own direction on a right-to-left page. */}
        {stay.complex_name && (
          <span dir="auto" className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">{stay.complex_name}</span>
        )}
        <h1 dir="auto" className="font-guest-display text-[32px] font-bold leading-[1.1] tracking-tight">{stay.name}</h1>
      </section>

      {/* Opened from a tag or a QR code in the flat: the guest staying now opens their booking. */}
      {openedInFlat(window.location.search) && <StayHereBanner code={stay.code} whatsapp={stay.company?.whatsapp ?? null} />}

      {facts.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto px-5 pb-1 pt-4 [scrollbar-width:none]">
          {facts.map(({ icon: Icon, text }) => (
            <li key={text} className="flex shrink-0 items-center gap-2 rounded-full bg-stone-100 px-3.5 py-2 text-sm font-medium">
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
      )}

      {(stay.prices.night != null || stay.prices.hour != null) && (
        <section aria-label={t('guest.price')} className="mx-5 mt-5 flex flex-col gap-2 rounded-[24px] bg-stone-50 p-5">
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

      {stay.description && (
        <section className="flex flex-col gap-2 px-5 pt-8">
          <h2 className="font-guest-display text-[22px] font-bold tracking-tight">{t('guest.about')}</h2>
          <LongText text={stay.description} />
        </section>
      )}

      {stay.amenities.length > 0 && (
        <section className="flex flex-col gap-3 px-5 pt-8">
          <h2 className="font-guest-display text-[22px] font-bold tracking-tight">{t('guest.amenities')}</h2>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-3">
            {(allAmenities ? stay.amenities : stay.amenities.slice(0, AMENITIES_SHOWN)).map((a) => {
              const Icon = amenityIcon(a.name, a.category)
              return (
                <li key={a.name} className="flex items-center gap-3 text-[15px] leading-snug">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-stone-100">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span dir="auto">{a.name}</span>
                </li>
              )
            })}
          </ul>
          {!allAmenities && stay.amenities.length > AMENITIES_SHOWN && (
            <button
              type="button"
              onClick={() => setAllAmenities(true)}
              className="h-12 rounded-full border border-gray-900 px-5 text-sm font-semibold"
            >
              {t('guest.allAmenities', { count: stay.amenities.length })}
            </button>
          )}
        </section>
      )}

      {stay.nights.length > 0 && (
        <section id="dates" className="flex scroll-mt-4 flex-col gap-4 px-5 pt-8">
          <h2 className="font-guest-display text-[22px] font-bold tracking-tight">{t('guest.freeDates')}</h2>
          {months.map((month) => (
            <div key={month.getMonth()} className="flex flex-col gap-2">
              <h3 className="text-base font-semibold capitalize">
                {monthName.format(month)} {month.getFullYear()}
              </h3>
              <div className="grid grid-cols-7 text-center text-xs text-gray-600">
                {t('guest.weekdays').split(' ').map((d) => <span key={d}>{d}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-y-1">
                {fromThisWeek(monthCells(month.getFullYear(), month.getMonth()), today).map((day, n) => {
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
                      className={`flex h-12 flex-col items-center justify-center gap-0.5 text-[15px] ${
                        edge ? 'rounded-full bg-[var(--accent)] font-semibold text-[var(--on-accent)]' : inside ? 'bg-stone-100' : 'rounded-full'
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

      {(stay.rental_mode !== 'hourly' || stay.check_in_method) && (
        <section className="flex flex-col gap-3 px-5 pt-8">
          <h2 className="font-guest-display text-[22px] font-bold tracking-tight">{t('guest.checkInTitle')}</h2>
          {stay.rental_mode !== 'hourly' && (
          <div className="grid grid-cols-2 gap-2">
            {stay.check_in_hour != null && (
              <div className="flex flex-col gap-1 rounded-[20px] bg-stone-50 p-4">
                <span className="text-sm text-gray-600">{t('guest.checkIn')}</span>
                <span className="text-lg font-bold">{t('guest.from', { hour: stay.check_in_hour })}</span>
              </div>
            )}
            {stay.check_out_hour != null && (
              <div className="flex flex-col gap-1 rounded-[20px] bg-stone-50 p-4">
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
        <section className="flex flex-col gap-2 px-5 pt-8">
          <h2 className="font-guest-display text-[22px] font-bold tracking-tight">{t('guest.rules')}</h2>
          <LongText text={stay.house_rules} />
        </section>
      )}

      <section className="flex flex-col gap-3 px-5 pt-8">
        <h2 className="font-guest-display text-[22px] font-bold tracking-tight">{t('guest.location')}</h2>
        <div className="flex items-start gap-3 rounded-[24px] bg-stone-50 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[var(--accent)]">
            <MapPin className="h-5 w-5" aria-hidden />
          </span>
          <div className="flex flex-col gap-0.5">
            {stay.complex_name && <span dir="auto" className="text-base font-semibold">{stay.complex_name}</span>}
            <span className="text-sm text-gray-600">{t('guest.addressAfter')}</span>
          </div>
        </div>
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
      {gallery && (
        <div role="dialog" aria-modal="true" aria-label={t('guest.photos')} onKeyDown={(e) => e.key === 'Escape' && setGallery(false)} className="fixed inset-0 z-overlay overflow-y-auto bg-white">
          <div className="sticky top-0 z-10 flex items-center justify-between bg-white/90 px-4 py-2 backdrop-blur">
            <span className="text-base font-bold">{t('guest.allPhotos', { count: stay.photos.length })}</span>
            <button type="button" autoFocus onClick={() => setGallery(false)} aria-label={t('guest.close')} className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          {/* Each photo at its own shape, two columns: the flat at a glance, as a board of pins. */}
          <div className="columns-2 gap-2 px-2 pb-8 sm:columns-3">
            {stay.photos.map((url, n) => (
              <button key={url} type="button" onClick={() => setZoomed(n)} className="mb-2 block w-full break-inside-avoid overflow-hidden rounded-2xl bg-stone-100">
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
      <p dir="auto" className={`whitespace-pre-line text-base leading-relaxed text-gray-800 ${long && !open ? 'line-clamp-5' : ''}`}>
        {text}
      </p>
      {long && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="h-11 self-start text-sm font-semibold underline underline-offset-4">
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
      <button type="button" onClick={() => void share()} aria-label={t('guest.share')} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white ring-1 ring-white/25 backdrop-blur-md">
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
