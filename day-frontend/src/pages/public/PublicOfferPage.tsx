import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { getPublicOffer, type PublicOffer, type PublicOfferFlat } from '../../api/public'
import { isHourly, money, offerDates, retryNetwork } from '../../lib/public-stay'
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
      {offer.isPending && <p className="p-6 text-sm text-gray-500">{t('guest.loading')}</p>}
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

  return (
    <main className="flex flex-col gap-6 px-4 pb-10 pt-6">
      <section className="flex flex-col gap-3 px-1">
        <h1 className="font-guest-display text-[30px] font-bold leading-[1.15] tracking-tight">
          {offer.guest ? t('guestOffer.hello', { name: offer.guest }) : t('guestOffer.title')}
        </h1>
        <p className="flex flex-wrap gap-2 text-sm font-medium">
          <span className="rounded-full bg-stone-100 px-3.5 py-2">{dates}</span>
          <span className="rounded-full bg-stone-100 px-3.5 py-2">{nights}</span>
          <span className="rounded-full bg-stone-100 px-3.5 py-2">{t('guestOffer.guests', { count: offer.guests })}</span>
        </p>
        {allFree && (
          // Two sentences of their own: joined by a space they read as one, with no stop between.
          <p className="flex flex-col items-start gap-1.5 text-sm text-emerald-900">
            <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold">
              {offer.flats.length === 1 ? t('guestOffer.freeOne') : t('guestOffer.freeAll')}
            </span>
            <span>{t('guestOffer.hold')}</span>
          </p>
        )}
      </section>
      {lapsed && (
        <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {t('guestOffer.lapsed')}
        </p>
      )}

      {offer.flats.length === 0 && <p className="text-base text-gray-700">{t('guestOffer.none')}</p>}
      <div className="flex flex-col gap-8">
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
      </div>

      <footer className="pt-3 text-xs text-gray-500">{t('guest.poweredBy')}</footer>
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
    flat.rooms ? t('guest.rooms', { count: flat.rooms }) : null,
    flat.area_total ? t('guest.area', { area: flat.area_total.toLocaleString(locale) }) : null,
    flat.floor != null ? t('guest.floor', { floor: flat.floor }) : null,
  ].filter(Boolean)

  return (
    <article data-flat={flat.code} className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-[24px] bg-stone-100">
        {flat.photo ? (
          // The name is the heading below; photos past the first wait for the scroll.
          <img
            src={flat.photo}
            alt=""
            loading={first ? 'eager' : 'lazy'}
            decoding="async"
            className={`aspect-[4/3] w-full object-cover ${flat.free ? '' : 'grayscale'}`}
          />
        ) : (
          <div className="aspect-[4/3] w-full" aria-hidden />
        )}
      </div>
      <div className="flex flex-col gap-2 px-1">
        <h2 dir="auto" className="text-xl font-bold leading-snug tracking-tight">{flat.name}</h2>
        {(flat.complex_name || facts.length > 0) && (
          <p className="text-sm text-gray-600">{[flat.complex_name, ...facts].filter(Boolean).join(' · ')}</p>
        )}
        {flat.free ? (
          flat.total != null ? (
            <p className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold">{money(flat.total, locale)}</span>
              <span className="text-sm text-gray-600">{t('guestOffer.forStay', { nights })}</span>
            </p>
          ) : (
            <p className="text-sm text-gray-600">{t('guestOffer.noPrice')}</p>
          )
        ) : (
          <p className="text-sm font-semibold text-amber-800">{t('guestOffer.taken')}</p>
        )}
        <div className="mt-1 grid grid-cols-2 gap-2">
          <Link
            to="/s/$code"
            params={{ code: flat.code }}
            aria-label={`${t('guestOffer.details')}: ${flat.name}`}
            className="flex h-12 items-center justify-center rounded-full bg-stone-100 text-sm font-semibold"
          >
            {t('guestOffer.details')}
          </Link>
          {flat.free && (
            <button
              type="button"
              onClick={onChoose}
              aria-label={`${t('guestOffer.choose')}: ${flat.name}`}
              className="h-12 rounded-full bg-emerald-700 text-sm font-bold text-white"
            >
              {t('guestOffer.choose')}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
