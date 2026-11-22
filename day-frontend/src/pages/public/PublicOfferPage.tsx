import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { getPublicOffer, type PublicOffer, type PublicOfferFlat } from '../../api/public'
import { parseISO } from 'date-fns'
import { Building2, LayoutGrid, Ruler, Users } from 'lucide-react'
import { clock, isHourly, money, offerDates, retryNetwork } from '../../lib/public-stay'
import { BookForm, Waiting } from './GuestBooking'
import { GuestFrame, LoadFailed } from './GuestFrame'

/** A guest's personal link from aidyn: the flats for the guest's dates, each with
 *  what the stay costs and whether it is still free. */
export default function PublicOfferPage({ code }: { code: string }) {
  return <GuestFrame personal>{(locale) => <Offer code={code} locale={locale} />}</GuestFrame>
}

function Offer({ code, locale }: { code: string; locale: string }) {
  const { t } = useTranslation()
  const offer = useQuery({
    queryKey: ['public-offer', code],
    queryFn: () => getPublicOffer(code),
    retry: retryNetwork,
    // Free and taken change by the minute: a guest back from Kaspi sees the link as it is.
    staleTime: 0,
    // Waiting for the deposit: the page sees the operator confirm, or the hold lapse;
    // past its time the sweep is due within the minute.
    refetchInterval: (query) => {
      const booking = query.state.data?.booking
      if (booking?.status !== 'pending') return false
      return booking.expires_at && Date.now() > Date.parse(booking.expires_at) ? 15_000 : 30_000
    },
  })
  return (
    <>
      {offer.isPending && <p className="p-6 text-sm text-[#76767F]">{t('guest.loading')}</p>}
      {offer.isError && !offer.data && (
        <LoadFailed
          error={offer.error}
          onRetry={() => void offer.refetch()}
          gone={{ 404: t('guestOffer.notFound'), 410: t('guestOffer.expired') }}
        />
      )}
      {offer.data && <OfferView offer={offer.data} locale={locale} onRefresh={() => void offer.refetch()} />}
    </>
  )
}

function OfferView({ offer, locale, onRefresh }: { offer: PublicOffer; locale: string; onRefresh: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [chosen, setChosen] = useState<string | null>(null)
  // A booking gone from the link: the hold ran out unpaid. Kept from the last render.
  const held = offer.booking !== null
  const [wasHeld, setWasHeld] = useState(held)
  const [lapsed, setLapsed] = useState(false)
  if (held !== wasHeld) {
    setWasHeld(held)
    setLapsed(!held)
    setChosen(null)
  }
  const dates = useMemo(() => offerDates(locale, offer), [locale, offer])
  // The stay's length: hours by the hour, nights by the night.
  const nights = isHourly(offer) ? t('guest.hours', { count: offer.hours ?? 0 }) : t('guest.nights', { count: offer.nights })
  const allFree = offer.flats.length > 0 && offer.flats.every((f) => f.free)
  const choice = offer.flats.find((f) => f.code === chosen)

  if (offer.booking) return <Waiting offer={offer} booking={offer.booking} locale={locale} />
  if (choice) {
    return (
      <BookForm
        offer={offer}
        flat={choice}
        locale={locale}
        onBack={() => setChosen(null)}
        onBooked={(booking) => {
          queryClient.setQueryData<PublicOffer>(['public-offer', offer.code], (old) => old && { ...old, booking })
          window.scrollTo(0, 0)
        }}
        onRefresh={onRefresh}
      />
    )
  }

  // The ticket's two ends: the day big, the weekday and the hour small; by the hour, the hours.
  const hourly = isHourly(offer)
  const dayBig = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  const end = (iso: string, at: string | null | undefined) => ({
    big: dayBig.format(parseISO(iso.slice(0, 10))).replace('.', ''),
    small: [weekday.format(parseISO(iso.slice(0, 10))), at ? clock(at) : null].filter(Boolean).join(', '),
  })
  const from = end(offer.check_in, hourly ? offer.starts_at : null)
  const to = end(hourly && offer.ends_at ? offer.ends_at : offer.check_out, hourly ? offer.ends_at : null)
  const free = offer.flats.filter((f) => f.free).length

  return (
    <main className="min-h-screen pb-10 text-[#111114]">
      <div className="px-5 pb-3.5 pt-1">
        <h1 className="font-guest-display text-[34px] font-bold leading-[1.05] tracking-[-0.035em]">
          {offer.guest ? t('guestOffer.hello', { name: offer.guest }) : t('guestOffer.title')}
        </h1>
        {free > 0 && <p className="mt-2 text-[15px] leading-snug text-[#76767F]">{t('guestOffer.hold')}</p>}
      </div>

      {/* The stay as a ticket, as the mockup: check-in, the nights, check-out. */}
      <section aria-label={dates} className="m-2 rounded-[28px] bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-[#76767F]">{t('guest.checkIn')}</p>
            <p className="font-guest-display text-[30px] font-bold leading-tight tracking-[-0.03em]">{from.big}</p>
            <p className="text-[13px] text-[#76767F]">{from.small}</p>
          </div>
          <span className="rounded-full bg-[color-mix(in_srgb,#2F5BFF_16%,white)] px-2.5 py-1 text-xs font-semibold text-[#2F5BFF]">{nights}</span>
          <div className="text-end">
            <p className="text-xs font-semibold text-[#76767F]">{t('guest.checkOut')}</p>
            <p className="font-guest-display text-[30px] font-bold leading-tight tracking-[-0.03em]">{to.big}</p>
            <p className="text-[13px] text-[#76767F]">{to.small}</p>
          </div>
        </div>
        <div className="mt-3.5 flex items-center justify-between border-t border-dashed border-[#DCDCE3] pt-3 text-sm font-semibold">
          <span>{t('guestOffer.guests', { count: offer.guests })}</span>
          {offer.flats.length > 0 && (
            <span className={free > 0 ? 'text-[#17A34A]' : 'text-[#76767F]'}>
              {allFree ? (offer.flats.length === 1 ? t('guestOffer.freeOne') : t('guestOffer.freeAll')) : t('guestOffer.freeOf', { free, total: offer.flats.length })}
            </span>
          )}
        </div>
      </section>

      {lapsed && (
        <p role="status" className="m-2 rounded-[20px] bg-[#FFF3DC] p-4 text-sm text-[#8A5A00]">
          {t('guestOffer.lapsed')}
        </p>
      )}

      {offer.flats.length === 0 && <p className="m-2 rounded-[28px] bg-white p-5 text-base text-[#2A2A30]">{t('guestOffer.none')}</p>}
      {offer.flats.map((flat, n) => (
        <FlatCard
          key={flat.code}
          flat={flat}
          nights={nights}
          locale={locale}
          first={n === 0}
          onChoose={() => {
            setChosen(flat.code)
            setLapsed(false)
            window.scrollTo(0, 0)
          }}
        />
      ))}

      {free > 0 && (
        <section className="m-2 rounded-[28px] bg-white p-5">
          <h2 className="font-guest-display text-[22px] font-bold tracking-[-0.025em]">{t('guestOffer.next')}</h2>
          <ol className="mt-3.5 flex flex-col gap-3.5">
            {[t('guestOffer.hold'), t('guestBook.step1'), t('guestBook.step3')].map((text, k) => (
              <li key={k} className="flex items-start gap-3 text-[15px] leading-snug">
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[#111114] text-sm font-bold text-white">{k + 1}</span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="px-6 pt-3 text-xs text-[#76767F]">{t('guest.poweredBy')}</footer>
    </main>
  )
}

function FlatCard({
  flat,
  nights,
  locale,
  first,
  onChoose,
}: {
  flat: PublicOfferFlat
  nights: string
  locale: string
  first: boolean
  onChoose: () => void
}) {
  const { t } = useTranslation()
  const facts = [
    flat.max_guests ? { icon: Users, text: t('guest.guests', { count: flat.max_guests }) } : null,
    flat.rooms ? { icon: LayoutGrid, text: t('guest.rooms', { count: flat.rooms }) } : null,
    flat.area_total ? { icon: Ruler, text: t('guest.area', { area: flat.area_total.toLocaleString(locale) }) } : null,
    flat.floor != null ? { icon: Building2, text: t('guest.floor', { floor: flat.floor }) } : null,
  ].filter((f): f is { icon: typeof Users; text: string } => f !== null)

  return (
    <article data-flat={flat.code} className={`m-2 rounded-[28px] bg-white p-2 pb-4 ${flat.free ? '' : 'opacity-70'}`}>
      <div className="relative h-[210px] overflow-hidden rounded-[22px] bg-[#D9D9E0]">
        {flat.photo && (
          // The name is the heading below; photos past the first wait for the scroll.
          <img src={flat.photo} alt="" loading={first ? 'eager' : 'lazy'} decoding="async" className={`h-full w-full object-cover ${flat.free ? '' : 'grayscale'}`} />
        )}
        <span className={`absolute start-2.5 top-2.5 inline-flex h-8 items-center rounded-full bg-white/90 px-3 text-xs font-semibold ${flat.free ? 'text-[#17663A]' : 'text-[#111114]'}`}>
          {flat.free ? t('guestOffer.freeOne') : t('guestOffer.taken')}
        </span>
      </div>
      <div className="flex flex-col gap-2.5 px-3 pt-3">
        <h2 dir="auto" className={`font-guest-display text-[22px] font-bold leading-tight tracking-[-0.025em] ${flat.free ? '' : 'text-[#76767F]'}`}>{flat.name}</h2>
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
        {flat.free &&
          (flat.total != null ? (
            <p className="flex items-baseline gap-1.5 rounded-[18px] bg-[#F3F3F6] px-4 py-3">
              <span className="text-[26px] font-bold tracking-[-0.03em]">{money(flat.total, locale)}</span>
              <span className="text-sm text-[#76767F]">{t('guestOffer.forStay', { nights })}</span>
            </p>
          ) : (
            <p className="text-sm text-[#76767F]">{t('guestOffer.noPrice')}</p>
          ))}
        {flat.free && (
          <div className="mt-1 grid grid-cols-2 gap-2">
            <Link
              to="/s/$code"
              params={{ code: flat.code }}
              aria-label={`${t('guestOffer.details')}: ${flat.name}`}
              className="flex h-12 items-center justify-center rounded-full bg-[#F3F3F6] text-[15px] font-semibold"
            >
              {t('guestOffer.details')}
            </Link>
            <button
              type="button"
              onClick={onChoose}
              aria-label={`${t('guestOffer.choose')}: ${flat.name}`}
              className="h-12 rounded-full bg-[#111114] text-[15px] font-semibold text-white"
            >
              {t('guestOffer.choose')}
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
