import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { getPublicOffer, type PublicOffer, type PublicOfferFlat } from '../../api/public'
import { money, retryNetwork, stayDates } from '../../lib/public-stay'
import { GuestFrame, LoadFailed } from './GuestFrame'

/** A guest's personal link from aidyn: the flats for the guest's dates, each with
 *  what the stay costs and whether it is still free. */
export default function PublicOfferPage({ code }: { code: string }) {
  return <GuestFrame>{(locale) => <Offer code={code} locale={locale} />}</GuestFrame>
}

function Offer({ code, locale }: { code: string; locale: string }) {
  const { t } = useTranslation()
  const offer = useQuery({ queryKey: ['public-offer', code], queryFn: () => getPublicOffer(code), retry: retryNetwork })
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
      {offer.data && <OfferView offer={offer.data} locale={locale} />}
    </>
  )
}

function OfferView({ offer, locale }: { offer: PublicOffer; locale: string }) {
  const { t } = useTranslation()
  const dates = useMemo(() => stayDates(locale, offer.check_in, offer.check_out), [locale, offer.check_in, offer.check_out])
  const nights = t('guest.nights', { count: offer.nights })
  const allFree = offer.flats.length > 0 && offer.flats.every((f) => f.free)

  return (
    <main className="flex flex-col gap-5 px-5 pb-10 pt-5">
      <section className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-bold leading-tight tracking-tight">
          {offer.guest ? t('guestOffer.hello', { name: offer.guest }) : t('guestOffer.title')}
        </h1>
        <p className="text-base text-gray-700">
          {dates} · {nights} · {t('guestOffer.guests', { count: offer.guests })}
        </p>
        {allFree && (
          <p className="text-sm font-semibold text-emerald-800">
            {offer.flats.length === 1 ? t('guestOffer.freeOne') : t('guestOffer.freeAll')}
          </p>
        )}
      </section>

      {offer.flats.length === 0 && <p className="text-base text-gray-700">{t('guestOffer.none')}</p>}
      {offer.flats.map((flat, n) => (
        <FlatCard key={flat.code} flat={flat} nights={nights} locale={locale} first={n === 0} />
      ))}

      <footer className="pt-3 text-xs text-gray-500">{t('guest.poweredBy')}</footer>
    </main>
  )
}

function FlatCard({ flat, nights, locale, first }: { flat: PublicOfferFlat; nights: string; locale: string; first: boolean }) {
  const { t } = useTranslation()
  const facts = [
    flat.rooms ? t('guest.rooms', { count: flat.rooms }) : null,
    flat.area_total ? t('guest.area', { area: flat.area_total.toLocaleString(locale) }) : null,
    flat.floor != null ? t('guest.floor', { floor: flat.floor }) : null,
  ].filter(Boolean)

  return (
    <article data-flat={flat.code} className="overflow-hidden rounded-2xl border border-gray-200">
      {flat.photo ? (
        // The name is the heading below; photos past the first wait for the scroll.
        <img
          src={flat.photo}
          alt=""
          loading={first ? 'eager' : 'lazy'}
          decoding="async"
          className="aspect-[4/3] w-full bg-gray-100 object-cover"
        />
      ) : (
        <div className="aspect-[4/3] w-full bg-gray-100" aria-hidden />
      )}
      <div className="flex flex-col gap-2 p-4">
        <h2 className="text-lg font-bold leading-snug">{flat.name}</h2>
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
        <Link
          to="/s/$code"
          params={{ code: flat.code }}
          aria-label={`${t('guestOffer.details')}: ${flat.name}`}
          className="mt-1 flex h-11 items-center justify-center rounded-xl border border-gray-200 text-sm font-semibold"
        >
          {t('guestOffer.details')}
        </Link>
      </div>
    </article>
  )
}
