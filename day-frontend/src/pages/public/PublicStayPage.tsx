import { useMemo, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { addDays, format, parseISO } from 'date-fns'
import { BedDouble, Building2, ChevronLeft, CigaretteOff, Images, KeyRound, LayoutGrid, LogIn, LogOut, Map as MapIcon, MapPin, MapPinned, Moon, Navigation, PartyPopper, PawPrint, Ruler, ScrollText, Share2, SquareParking, Users, X } from 'lucide-react'
import { getPublicStay, type PublicOfferBooking, type PublicStay } from '../../api/public'
import { amenityIcon } from '../../lib/amenity-icons'
import { MASK } from '../../lib/clarity'
import { amenitiesFirst, ruleItems, type RuleKind, SITE_MAX_NIGHTS, money, onAccent, openedInFlat, retryNetwork, stayFromUrl, stayQuote } from '../../lib/public-stay'
import { GuestFrame, LoadFailed } from './GuestFrame'
import { BookBar, BookSheet, HeldView } from './StayBooking'
import { StayCalendar } from './StayCalendar'
import { StayHereBanner } from './StayHere'
import { NearbyList } from './NearbyList'

// The mockup's blue when the company has no color of its own.
const DEFAULT_ACCENT = '#2F5BFF'

// About four months ahead: the server gives 120 nights at most.
const WINDOW_NIGHTS = 119
// Photos under the page, after the one on top: the flat at a glance.
const GALLERY_SHOWN = 4
// The guest does it themselves: no lock and no code to send.
const SELF_CHECK_IN = ['lockbox', 'keypad', 'smart_lock']
// Enough amenities to tell the flat, the rest a tap away.
const AMENITIES_SHOWN = 6
const RULE_ICONS: Record<RuleKind, typeof ScrollText> = { smoke: CigaretteOff, quiet: Moon, pets: PawPrint, party: PartyPopper, other: ScrollText }
// The approved guest mockup (28.10): white cards on a light grey page.
const CARD = 'm-2 rounded-[28px] bg-white p-5'
const H2 = 'font-guest-display text-[22px] font-bold tracking-[-0.025em]'
const MUTE = 'text-[#6B6B74]'
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
      {stay.isPending && <p className="p-6 text-sm text-[#6B6B74]">{t('guest.loading')}</p>}
      {/* A refresh that fails later keeps the page the guest has. */}
      {stay.isError && !stay.data && (
        <LoadFailed error={stay.error} onRetry={() => void stay.refetch()} gone={{ 404: t('guest.notFound') }} />
      )}
      {stay.data && <StayView stay={stay.data} locale={locale} today={today} until={until} />}
    </>
  )
}

function StayView({ stay, locale, today, until }: { stay: PublicStay; locale: string; today: string; until: string }) {
  const { t } = useTranslation()
  const [photo, setPhoto] = useState(0)
  const [gallery, setGallery] = useState(false)
  const [allAmenities, setAllAmenities] = useState(false)
  // The photo open on the whole screen, by its place in the list.
  const [zoomed, setZoomed] = useState<number | null>(null)
  const [booking, setBooking] = useState(false)
  const [held, setHeld] = useState<PublicOfferBooking | null>(null)
  // Opened from the company's search: its dates and guests come picked.
  const [fromSearch] = useState(() => stayFromUrl(window.location.search, today, until))
  const [{ checkIn, checkOut }, setStay] = useState<{ checkIn: string | null; checkOut: string | null }>({
    checkIn: fromSearch.checkIn,
    checkOut: fromSearch.checkOut,
  })

  const quote = checkIn && checkOut ? stayQuote(stay.nights, checkIn, checkOut) : null

  const shortDay = useMemo(() => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }), [locale])
  // The company's weekend nights by name in the guest's language ("Sat, Sun"): the weekend
  // tariff prices are for them. 2 Nov 2026 is a Monday, the server's 0.
  const weekendLabel = useMemo(() => {
    const name = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    return (stay.prices.weekend_nights ?? [4, 5]).map((night) => name.format(new Date(2026, 10, 2 + night))).join(', ')
  }, [locale, stay.prices.weekend_nights])
  const short = !quote || stay.min_nights == null || quote.count >= stay.min_nights ? null : stay.min_nights

  // Three tiles as the mockup, a number over its word: who fits, the rooms, the size;
  // beds and the floor fill in for what the flat does not say.
  const tiles = [
    stay.max_guests ? { icon: Users, value: String(stay.max_guests), label: t('guest.tileGuests', { count: stay.max_guests }) } : null,
    stay.rooms ? { icon: LayoutGrid, value: String(stay.rooms), label: t('guest.tileRooms', { count: stay.rooms }) } : null,
    stay.area_total ? { icon: Ruler, value: stay.area_total.toLocaleString(locale), label: t('guest.tileArea') } : null,
    stay.beds ? { icon: BedDouble, value: String(stay.beds), label: t('guest.tileBeds', { count: stay.beds }) } : null,
    stay.floor != null ? { icon: Building2, value: String(stay.floor), label: t('guest.tileFloor') } : null,
  ]
    .filter((tile): tile is { icon: typeof Users; value: string; label: string } => tile !== null)
    .slice(0, 3)

  const color = stay.company?.accent_color ?? DEFAULT_ACCENT
  const accent = { '--accent': color, '--on-accent': onAccent(color) } as CSSProperties
  const datesText = checkIn && checkOut ? `${shortDay.format(parseISO(checkIn))} – ${shortDay.format(parseISO(checkOut))}` : null
  // Every night free as loaded: a stay over a night the page has not seen is not offered.
  // Longer than a page books: the host agrees it in a chat.
  const long = quote != null && quote.count > SITE_MAX_NIGHTS
  const bookable = quote && quote.free && short == null && !long ? quote : null

  if (held) {
    return (
      <main style={accent} {...MASK}>
        <HeldView booking={held} locale={locale} />
      </main>
    )
  }

  return (
    <main style={accent} className="min-h-screen bg-[#EDEDF2] pb-28 text-[#111114]">
      <div className="mx-auto max-w-[480px]">
        {/* The flat in a rounded frame, its name over the photo, as the approved mockup (28.10).
            With no photo yet, a dark frame carries the name. */}
        <section
          aria-label={t('guest.photos')}
          className={`relative m-2 overflow-hidden rounded-[34px] ${stay.photos.length > 0 ? 'h-[480px] bg-[#D9D9E0]' : 'h-[300px] bg-[#111114]'}`}
        >
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
          {stay.photos.length > 0 && (
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,0)_25%,rgba(0,0,0,0)_50%,rgba(0,0,0,.6))]" aria-hidden />
          )}
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
            {/* The name keeps its longest word whole: where that word and the button do not
                fit side by side, the button goes to the line below instead of over the word. */}
            <div className="mt-3 flex flex-wrap items-end justify-between gap-2.5">
              <h1 dir="auto" className="font-guest-display max-w-full flex-1 break-words text-[36px] font-bold leading-[1.02] tracking-[-0.035em]">{stay.name}</h1>
              {stay.photos.length > 1 && (
                <button type="button" onClick={() => setGallery(true)} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-semibold text-[#111114]">
                  <Images className="h-4 w-4" aria-hidden />
                  {t('guest.photoCount', { count: stay.photos.length })}
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
          <section aria-label={t('guest.price')} className={`${CARD} flex flex-col gap-1`}>
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
          <ul className="m-2 grid gap-2" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
            {tiles.map(({ icon: Icon, value, label }) => (
              <li key={label} className="flex flex-col gap-3 rounded-[24px] bg-white px-3.5 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111114] text-white">
                  <Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <span className="flex flex-col">
                  <b className="text-[22px] leading-tight tracking-[-0.02em]">{value}</b>
                  <span className={`text-[13px] ${MUTE}`}>{label}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        {stay.nights.length > 0 && (
          <StayCalendar
            nights={stay.nights}
            today={today}
            locale={locale}
            range={{ checkIn, checkOut }}
            onRange={setStay}
            minNights={stay.min_nights}
            deposit={stay.prices.deposit}
            checkInHour={stay.rental_mode !== 'hourly' ? stay.check_in_hour : null}
            checkOutHour={stay.rental_mode !== 'hourly' ? stay.check_out_hour : null}
            byNight={stay.prices.night != null}
          />
        )}

        {stay.amenities.length > 0 && (
          <section className={CARD}>
            <h2 className={H2}>{t('guest.amenities')}</h2>
            <ul className="mt-3.5 grid grid-cols-2 gap-2">
              {(allAmenities ? amenitiesFirst(stay.amenities) : amenitiesFirst(stay.amenities).slice(0, AMENITIES_SHOWN)).map((a) => {
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

        <section className={`${CARD} flex flex-col gap-3`}>
          <h2 className={H2}>{t('guest.location')}</h2>
          {stay.complex_name && (
            <span dir="auto" className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full bg-[#F3F3F6] px-3.5 text-sm font-semibold">
              <MapPin className="h-4 w-4" aria-hidden />
              {stay.complex_name}
            </span>
          )}
          <p className={`text-sm ${MUTE}`}>{t('guest.addressAfter')}</p>
          {stay.parking && (
            <p dir="auto" className="flex items-start gap-2 text-[15px]">
              <SquareParking className="mt-0.5 h-[18px] w-[18px] shrink-0" aria-hidden />
              <span>
                <span className="font-semibold">{t('guest.parking')}</span> {stay.parking}
              </span>
            </p>
          )}
          {/* The complex by its name on the guest's map: the street and the flat stay for the booking page. */}
          {stay.complex_name && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Navigation, label: t('guest.map2gis'), href: `https://2gis.kz/search/${encodeURIComponent(stay.complex_name)}` },
                { icon: MapIcon, label: t('guest.mapYandex'), href: `https://yandex.kz/maps/?text=${encodeURIComponent(stay.complex_name)}` },
                { icon: MapPinned, label: t('guest.mapGoogle'), href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stay.complex_name)}` },
              ].map(({ icon: Icon, label, href }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="flex h-[46px] items-center justify-center gap-1.5 rounded-full bg-[#F3F3F6] text-sm font-semibold">
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </a>
              ))}
            </div>
          )}
          {!!stay.nearby?.length && <NearbyList places={stay.nearby} />}
        </section>

        {(stay.rental_mode !== 'hourly' || stay.check_in_method || stay.house_rules) && (
          <section className={`${CARD} flex flex-col gap-3.5`}>
            <h2 className={H2}>{t('guest.rules')}</h2>
            {stay.rental_mode !== 'hourly' && (stay.check_in_hour != null || stay.check_out_hour != null) && (
              <ul className="grid grid-cols-2 gap-2">
                {stay.check_in_hour != null && (
                  <li className="flex items-center gap-2.5 text-sm">
                    <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#F3F3F6]"><LogIn className="h-[17px] w-[17px] rtl:rotate-180" aria-hidden /></span>
                    {t('guest.checkIn')} {t('guest.from', { hour: stay.check_in_hour })}
                  </li>
                )}
                {stay.check_out_hour != null && (
                  <li className="flex items-center gap-2.5 text-sm">
                    <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#F3F3F6]"><LogOut className="h-[17px] w-[17px] rtl:rotate-180" aria-hidden /></span>
                    {t('guest.checkOut')} {t('guest.until', { hour: stay.check_out_hour })}
                  </li>
                )}
              </ul>
            )}
            {stay.check_in_method && (
              <p className="flex items-center gap-2.5 text-sm">
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#F3F3F6]">
                  <KeyRound className="h-[17px] w-[17px]" aria-hidden />
                </span>
                <span>
                  {SELF_CHECK_IN.includes(stay.check_in_method)
                    ? t('guest.checkInHow', { method: t(`properties.checkInMethod.${stay.check_in_method}`) })
                    : t(`properties.checkInMethod.${stay.check_in_method}`)}
                </span>
              </p>
            )}
            {stay.house_rules && ruleItems(stay.house_rules) ? (
              // Short rules one by one, each with its icon, as the mockup; prose stays one text.
              <ul aria-label={t('guest.rules')} className="grid grid-cols-2 gap-2">
                {ruleItems(stay.house_rules)!.map(({ text, kind }) => {
                  const Icon = RULE_ICONS[kind]
                  return (
                    <li key={text} dir="auto" className="flex items-center gap-2.5 text-sm">
                      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#F3F3F6]"><Icon className="h-[17px] w-[17px]" aria-hidden /></span>
                      {text}
                    </li>
                  )
                })}
              </ul>
            ) : stay.house_rules ? (
              <div className="flex items-start gap-2.5">
                <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#F3F3F6]"><ScrollText className="h-[17px] w-[17px]" aria-hidden /></span>
                <div className="flex min-w-0 flex-col gap-1 pt-1.5 text-sm">
                  <LongText text={stay.house_rules} />
                </div>
              </div>
            ) : null}
          </section>
        )}

        {stay.photos.length > 1 && (
          <div className="m-2 columns-2 gap-2">
            {stay.photos.slice(1, 1 + GALLERY_SHOWN).map((url, n) => (
              <button key={url} type="button" onClick={() => setZoomed(n + 1)} className="mb-2 block w-full break-inside-avoid overflow-hidden rounded-[22px] bg-[#D9D9E0]">
                <img src={url} alt={t('guest.photoOf', { n: n + 2, total: stay.photos.length })} loading="lazy" decoding="async" className="w-full" />
              </button>
            ))}
          </div>
        )}

        <footer className={`px-6 pb-6 pt-4 text-xs ${MUTE}`}>{t('guest.poweredBy')}</footer>
      </div>

      {/* Always on screen, as the mockup: the price, then the stay picked; booking needs the company's site. */}
      <BookBar
        stay={stay}
        locale={locale}
        quote={bookable}
        dates={datesText}
        canPickDates={stay.nights.length > 0}
        onPickDates={() => document.getElementById('dates')?.scrollIntoView({ behavior: 'smooth' })}
        onBook={stay.company ? () => setBooking(true) : null}
      />
      {booking && bookable && checkIn && checkOut && (
        <BookSheet
          stay={stay}
          locale={locale}
          checkIn={checkIn}
          checkOut={checkOut}
          total={bookable.total}
          guests={fromSearch.guests}
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
        <span role="status" className="fixed inset-x-0 top-4 z-overlay mx-auto w-fit rounded-full bg-[#111114] px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {t('guest.linkCopied')}
        </span>
      )}
    </>
  )
}
