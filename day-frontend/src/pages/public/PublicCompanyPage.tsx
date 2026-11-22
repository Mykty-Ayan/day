import { useRef, useState, type CSSProperties } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { Calendar, CircleCheck, Images, Instagram, LayoutGrid, MessageCircle, Minus, Plus, Ruler, Search, ShieldCheck, Users } from 'lucide-react'
import { getPublicCompany, type PublicCompany, type PublicCompanyFlat } from '../../api/public'
import { money, onAccent, retryNetwork } from '../../lib/public-stay'
import { GuestFrame, LoadFailed } from './GuestFrame'

// The mockup's blue when the company has no color of its own.
const DEFAULT_ACCENT = '#2F5BFF'
// A search by dates holds as many nights as the server takes (MAX_SEARCH_NIGHTS), and checks
// out no later than the flat's page shows nights (MAX_SEARCH_AHEAD_DAYS, WINDOW_NIGHTS).
const MAX_SEARCH_NIGHTS = 30
const MAX_SEARCH_AHEAD_DAYS = 119
// «For a family»: a flat that takes four guests or more.
const FAMILY_GUESTS = 4

type Stay = { checkIn: string; checkOut: string; guests: number }
type Filter = number | 'family' | null

/** A company's page for guests, opened by its link with no sign-in: who it is,
 *  how to write to it, its rules and its flats, each leading to the flat's page. */
export default function PublicCompanyPage({ slug }: { slug: string }) {
  return <GuestFrame overlay="page">{(locale) => <Company slug={slug} locale={locale} />}</GuestFrame>
}

function Company({ slug, locale }: { slug: string; locale: string }) {
  const { t } = useTranslation()
  const company = useQuery({
    queryKey: ['public-company', slug],
    queryFn: () => getPublicCompany(slug),
    retry: retryNetwork,
  })
  return (
    <>
      {company.isPending && <p className="p-6 text-sm text-[#76767F]">{t('guest.loading')}</p>}
      {company.isError && !company.data && (
        <LoadFailed error={company.error} onRetry={() => void company.refetch()} gone={{ 404: t('guestCompany.notFound') }} />
      )}
      {company.data && <CompanyView company={company.data} locale={locale} />}
    </>
  )
}

function CompanyView({ company, locale }: { company: PublicCompany; locale: string }) {
  const { t } = useTranslation()
  const accent = company.accent_color ?? DEFAULT_ACCENT
  // The company's color drives every button and link on the page.
  const style = { '--accent': accent, '--on-accent': onAccent(accent) } as CSSProperties
  const today = company.today ?? format(new Date(), 'yyyy-MM-dd')
  // The guest's dates once they ask: the flats free for all the nights, each with their price.
  const [stay, setStay] = useState<Stay | null>(null)
  const searched = useQuery({
    queryKey: ['public-company', company.slug, stay?.checkIn, stay?.checkOut, stay?.guests],
    queryFn: () => getPublicCompany(company.slug, stay!),
    enabled: stay != null,
    retry: retryNetwork,
    // The old answer stays on screen while new dates load: no blink.
    placeholderData: keepPreviousData,
  })
  // An answer for earlier dates is not shown as one for the new dates: wait for the new one.
  const answered = stay != null && searched.data != null && !searched.isPlaceholderData
  const flats = answered ? searched.data!.flats : company.flats
  const fit = stay
    ? flats.filter((f) => f.stay_free && (f.max_guests == null || f.max_guests >= stay.guests))
    : flats
  // Filters by rooms, when the flats differ in them, and «for a family»: the guest narrows the list in a tap.
  const roomCounts = [...new Set(company.flats.map((f) => f.rooms).filter((r): r is number => r != null && r > 0))].sort((a, b) => a - b)
  const family = company.flats.some((f) => (f.max_guests ?? 0) >= FAMILY_GUESTS) && company.flats.some((f) => (f.max_guests ?? 0) < FAMILY_GUESTS)
  const filters: Filter[] = roomCounts.length > 1 || family ? [null, ...(roomCounts.length > 1 ? roomCounts : []), ...(family ? ['family' as const] : [])] : []
  const [filter, setFilter] = useState<Filter>(null)
  const shown = fit.filter((f) => (filter == null ? true : filter === 'family' ? (f.max_guests ?? 0) >= FAMILY_GUESTS : f.rooms === filter))
  const most = Math.max(1, ...company.flats.map((f) => f.max_guests ?? 1))
  const range = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' })

  return (
    <main style={style} className="min-h-screen pb-10 text-[#111114]">
      {/* The company by its logo and name; the language button floats at the row's end (GuestFrame). */}
      <div className="flex h-[76px] items-center gap-2.5 px-4 pe-24">
        {company.logo_url ? (
          <img src={company.logo_url} alt="" className="h-11 w-11 shrink-0 rounded-full bg-white object-cover" />
        ) : (
          <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#111114] text-lg font-bold text-white">
            {company.title.trim().charAt(0).toUpperCase()}
          </span>
        )}
        {/* With a headline the name sits by the logo; without one the name is the headline. */}
        {company.tagline && <span dir="auto" className="min-w-0 truncate text-base font-bold">{company.title}</span>}
      </div>

      <div className="px-5 pb-4 pt-2.5">
        <h1 dir="auto" className="font-guest-display text-[40px] font-bold leading-[1.02] tracking-[-0.035em]">{company.tagline || company.title}</h1>
        {company.about && <p dir="auto" className="mt-3 whitespace-pre-line text-base leading-relaxed text-[#76767F]">{company.about}</p>}
      </div>

      {company.flats.length > 0 && <SearchCard today={today} most={most} stay={stay} onSearch={setStay} />}

      {company.rules.length > 0 && (
        <ul aria-label={t('guestCompany.rules')} className="flex flex-wrap gap-2 px-3 pb-2">
          {company.rules.map((rule) => (
            <li key={rule} dir="auto" className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
              {rule}
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="company-flats">
        <div className="flex items-baseline justify-between px-5 pb-2 pt-5">
          <h2 id="company-flats" className="font-guest-display text-[22px] font-bold tracking-[-0.025em]">
            {stay
              ? t('guestCompany.freeOn', { dates: range.formatRange(parseISO(stay.checkIn), parseISO(stay.checkOut)) })
              : t('guestCompany.ourFlats')}
          </h2>
          {(!stay || answered) && <span aria-live="polite" className="text-sm text-[#76767F]">{shown.length}</span>}
        </div>
        {filters.length > 0 && (
          <div role="radiogroup" aria-label={t('guestCompany.byRooms')} className="flex gap-1.5 overflow-x-auto px-3 pb-1 pt-1 [scrollbar-width:none]">
            {filters.map((f) => (
              <button
                key={f ?? 'all'}
                type="button"
                role="radio"
                aria-checked={filter === f}
                onClick={() => setFilter(f)}
                className={`h-10 shrink-0 rounded-full border px-4 text-sm font-semibold ${filter === f ? 'border-[#111114] bg-[#111114] text-white' : 'border-[#D9D9E0]'}`}
              >
                {f == null ? t('guestCompany.all') : f === 'family' ? t('guestCompany.family') : t('guest.rooms', { count: f })}
              </button>
            ))}
          </div>
        )}
        {company.flats.length === 0 && <p className="m-2 rounded-[28px] bg-white p-5 text-base text-[#76767F]">{t('guestCompany.noFlats')}</p>}
        {stay && searched.isError && !answered && (
          <LoadFailed error={searched.error} onRetry={() => void searched.refetch()} gone={{ 404: t('guestCompany.notFound') }} />
        )}
        {answered && shown.length === 0 && (
          <div className="m-2 rounded-[28px] bg-white p-5 text-base text-[#76767F]">
            <p>{t('guestCompany.noneFree')}</p>
            <button type="button" onClick={() => setStay(null)} className="mt-2 h-11 font-semibold text-[var(--accent)]">
              {t('guest.resetDates')}
            </button>
          </div>
        )}
        {(!stay || answered) &&
          shown.map((flat, n) => (
            <FlatTile key={flat.code} flat={flat} locale={locale} first={n === 0} today={today} stay={stay} />
          ))}
        {stay && !answered && !searched.isError && <p className="p-6 text-sm text-[#76767F]">{t('guest.loading')}</p>}
      </section>

      {company.flats.length > 0 && (
        <section className="m-2 rounded-[28px] bg-white p-5">
          <h2 className="font-guest-display text-[22px] font-bold tracking-[-0.025em]">{t('guestCompany.howTitle')}</h2>
          <ol className="mt-3.5 flex flex-col gap-3.5">
            {[
              [t('guestCompany.how1'), t('guestCompany.how1Hint')],
              [t('guestCompany.how2'), t('guestBook.holdNote')],
              [t('guestCompany.how3'), t('guestBook.step3')],
            ].map(([title, hint], k) => (
              <li key={k} className="flex items-start gap-3">
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[#111114] text-sm font-bold text-white">{k + 1}</span>
                <span className="flex flex-col gap-0.5 pt-0.5">
                  <b className="text-[15px]">{title}</b>
                  <span className="text-sm leading-snug text-[#76767F]">{hint}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {(company.whatsapp || company.instagram) && (
        <section className="m-2 rounded-[28px] bg-white p-5">
          <h2 className="font-guest-display text-[22px] font-bold tracking-[-0.025em]">{t('guestCompany.askTitle')}</h2>
          <p className="mb-4 mt-2 text-[15px] text-[#76767F]">{t('guestCompany.askHint')}</p>
          <div className="flex gap-2">
            {company.whatsapp && (
              <a
                href={`https://wa.me/${company.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('guestCompany.write')}
                className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-[var(--accent)] text-base font-semibold text-[var(--on-accent)]"
              >
                <MessageCircle className="h-5 w-5" aria-hidden />
                WhatsApp
              </a>
            )}
            {company.instagram && (
              <a
                href={`https://instagram.com/${company.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Instagram @${company.instagram}`}
                className="flex h-[52px] min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-[#F3F3F6] px-3 text-base font-semibold"
              >
                <Instagram className="h-5 w-5 shrink-0" aria-hidden />
                Instagram
              </a>
            )}
          </div>
        </section>
      )}

      <footer className="px-6 pt-4 text-xs text-[#76767F]">{t('guest.poweredBy')}</footer>
    </main>
  )
}

// A flat as the mockup: its photo with the name over it, the facts, the price and one step.
function FlatTile({ flat, locale, first, today, stay }: { flat: PublicCompanyFlat; locale: string; first: boolean; today: string; stay: Stay | null }) {
  const { t } = useTranslation()
  const facts = [
    flat.max_guests ? { icon: Users, text: t('guest.guests', { count: flat.max_guests }) } : null,
    flat.rooms ? { icon: LayoutGrid, text: t('guest.rooms', { count: flat.rooms }) } : null,
    flat.area_total ? { icon: Ruler, text: t('guest.area', { area: flat.area_total.toLocaleString(locale) }) } : null,
  ].filter(Boolean) as { icon: typeof Users; text: string }[]
  const price = flat.night_price ?? flat.hour_price
  const dayLabel = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' })
  // The guest's dates go along: the flat's page opens with them picked.
  const href = stay ? `/s/${flat.code}?in=${stay.checkIn}&out=${stay.checkOut}&guests=${stay.guests}` : `/s/${flat.code}`
  const nights = stay ? differenceInCalendarDays(parseISO(stay.checkOut), parseISO(stay.checkIn)) : 0

  return (
    <a href={href} className="m-2 block rounded-[32px] bg-white p-2 pb-4">
      <div className="relative h-[300px] overflow-hidden rounded-[26px] bg-[#111114]">
        {flat.photo && <img src={flat.photo} alt="" loading={first ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_45%,rgba(0,0,0,.6))]" aria-hidden />
        {stay && (
          <span className="absolute start-2.5 top-2.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-[#E8F7EE] px-3 text-xs font-semibold text-[#17663A]">
            <CircleCheck className="h-[15px] w-[15px]" aria-hidden />
            {t('guestCompany.freeForDates')}
          </span>
        )}
        {!stay && flat.free_from && (
          <span className={`absolute start-2.5 top-2.5 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${flat.free_from === today ? 'bg-[#E8F7EE] text-[#17663A]' : 'bg-[#FFF3DC] text-[#8A5A00]'}`}>
            {flat.free_from === today ? <CircleCheck className="h-[15px] w-[15px]" aria-hidden /> : <Calendar className="h-[15px] w-[15px]" aria-hidden />}
            {flat.free_from === today ? t('guestCompany.freeToday') : t('guestCompany.freeFrom', { day: dayLabel.format(parseISO(flat.free_from)) })}
          </span>
        )}
        {(flat.photos ?? 0) > 1 && (
          <span className="absolute end-2.5 top-2.5 inline-flex h-8 items-center gap-1.5 rounded-full border border-white/30 bg-white/20 px-3 text-xs font-semibold text-white backdrop-blur-md">
            <Images className="h-[15px] w-[15px]" aria-hidden />
            {flat.photos}
          </span>
        )}
        <h3 dir="auto" className="font-guest-display absolute inset-x-4 bottom-4 text-[26px] font-bold leading-[1.05] tracking-[-0.03em] text-white">{flat.name}</h3>
      </div>
      <div className="flex flex-col gap-3 px-3 pt-3">
        {(flat.complex_name || facts.length > 0) && (
          <p className="flex flex-wrap gap-x-3.5 gap-y-1 text-sm text-[#76767F]">
            {flat.complex_name && <span dir="auto">{flat.complex_name}</span>}
            {facts.map(({ icon: Icon, text }) => (
              <span key={text} className="inline-flex items-center gap-1.5">
                <Icon className="h-4 w-4" aria-hidden />
                {text}
              </span>
            ))}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          {stay && flat.stay_total != null ? (
            <p className="flex items-baseline gap-1.5">
              <b className="text-[22px] tracking-[-0.02em]">{money(flat.stay_total, locale)}</b>
              <span className="text-sm text-[#76767F]">{t('guestCompany.forNights', { count: nights })}</span>
            </p>
          ) : price != null ? (
            <p className="flex items-baseline gap-1.5">
              <b className="text-[22px] tracking-[-0.02em]">{money(price, locale)}</b>
              <span className="text-sm text-[#76767F]">{flat.night_price != null ? t('guest.perNight') : t('guest.perHour')}</span>
            </p>
          ) : (
            <span />
          )}
          <span className="flex h-11 shrink-0 items-center rounded-full bg-[#111114] px-[18px] text-[15px] font-semibold text-white">{t('guestCompany.view')}</span>
        </div>
      </div>
    </a>
  )
}

// The search as the mockup: check-in and check-out by the phone's own date picker, the guests by
// a stepper, then «Show free flats». The dates go to the server only on that tap.
function SearchCard({ today, most, stay, onSearch }: { today: string; most: number; stay: Stay | null; onSearch: (stay: Stay) => void }) {
  const { t, i18n } = useTranslation()
  const [checkIn, setCheckIn] = useState(stay?.checkIn ?? '')
  const [checkOut, setCheckOut] = useState(stay?.checkOut ?? '')
  const [guests, setGuests] = useState(stay?.guests ?? Math.min(2, most))
  const inRef = useRef<HTMLInputElement>(null)
  const outRef = useRef<HTMLInputElement>(null)
  const day = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })
  const iso = (d: Date) => format(d, 'yyyy-MM-dd')
  const horizon = iso(addDays(parseISO(today), MAX_SEARCH_AHEAD_DAYS))
  const lastIn = iso(addDays(parseISO(horizon), -1))
  const firstOut = checkIn ? iso(addDays(parseISO(checkIn), 1)) : iso(addDays(parseISO(today), 1))
  const lastOut = checkIn ? [iso(addDays(parseISO(checkIn), MAX_SEARCH_NIGHTS)), horizon].sort()[0] : horizon
  const ready = Boolean(checkIn && checkOut && checkIn >= today && checkIn <= lastIn && checkOut > checkIn && checkOut <= lastOut)

  function pickIn(value: string) {
    setCheckIn(value)
    // A check-out no longer after the check-in, or too far from it, moves to the next day.
    if (value && (!checkOut || checkOut <= value || checkOut > iso(addDays(parseISO(value), MAX_SEARCH_NIGHTS)) || checkOut > horizon)) {
      setCheckOut(iso(addDays(parseISO(value), 1)))
    }
  }
  // The whole field opens the picker, not only its small icon.
  const open = (input: HTMLInputElement | null) => {
    try {
      input?.showPicker()
    } catch {
      input?.focus()
    }
  }

  const field = 'relative flex flex-col gap-0.5 rounded-[20px] bg-[#F3F3F6] px-3.5 py-3 text-start'
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (ready) onSearch({ checkIn, checkOut, guests })
      }}
      className="mx-2 mt-4 grid grid-cols-2 gap-2 rounded-[28px] bg-white p-2"
    >
      {(
        [
          [inRef, t('guest.checkIn'), checkIn, pickIn, today, lastIn],
          [outRef, t('guest.checkOut'), checkOut, setCheckOut, firstOut, lastOut],
        ] as const
      ).map(([ref, label, value, set, min, max]) => (
        <label key={label} className={field} onClick={() => open(ref.current)}>
          <span className="text-xs font-semibold text-[#76767F]">{label}</span>
          <b className="text-base">{value ? day.format(parseISO(value)) : t('guestCompany.pick')}</b>
          <input
            ref={ref}
            type="date"
            value={value}
            min={min}
            max={max}
            onChange={(e) => set(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      ))}
      <div className={`${field} col-span-2 flex-row items-center justify-between`}>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-[#76767F]">{t('guestCompany.guests')}</span>
          <b aria-live="polite" className="text-base">{t('guestCompany.guestsCount', { count: guests })}</b>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            aria-label={t('guestCompany.lessGuests')}
            disabled={guests <= 1}
            onClick={() => setGuests((g) => g - 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white disabled:text-[#C7C7CC]"
          >
            <Minus className="h-[18px] w-[18px]" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={t('guestCompany.moreGuests')}
            disabled={guests >= most}
            onClick={() => setGuests((g) => g + 1)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white disabled:text-[#C7C7CC]"
          >
            <Plus className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>
      </div>
      <button
        type="submit"
        disabled={!ready}
        className="col-span-2 flex h-[52px] items-center justify-center gap-2 rounded-full bg-[#111114] text-base font-semibold text-white disabled:bg-[#B4B4BD]"
      >
        <Search className="h-5 w-5" aria-hidden />
        {t('guestCompany.showFree')}
      </button>
    </form>
  )
}
