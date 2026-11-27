import { useTranslation } from 'react-i18next'
import type { PublicCompany } from '../../api/public'
import { money } from '../../lib/public-stay'

/** The top of a company's site: the logo and name, then a photo with the headline on it, the words
 *  about the company and what it offers in one line. The photo is the site's cover, else the first
 *  flat's photo: a page of flats opens on a flat. With no photo at all the headline stands in words. */
export function CompanyHero({ company, locale }: { company: PublicCompany; locale: string }) {
  const { t } = useTranslation()
  const cover = company.cover_url || company.flats.find((f) => f.photo)?.photo || null
  const nights = company.flats.map((f) => f.night_price).filter((p): p is number => p != null)
  const facts = [
    company.flats.length > 0 ? t('guestCompany.flatsCount', { count: company.flats.length }) : null,
    nights.length > 0 ? t('guestCompany.nightFrom', { price: money(Math.min(...nights), locale) }) : null,
  ].filter(Boolean)
  const headline = company.tagline || company.title
  return (
    <>
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

      {cover && (
        <div className="px-2">
          <div className="relative h-[300px] overflow-hidden rounded-[28px] bg-[#111114] text-white">
            <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" aria-hidden />
            <h1 dir="auto" className="font-guest-display absolute inset-x-5 bottom-5 text-[34px] font-bold leading-[1.02] tracking-[-0.035em]">
              {headline}
            </h1>
          </div>
        </div>
      )}

      <div className={`px-5 pb-4 ${cover ? 'pt-1' : 'pt-2.5'}`}>
        {!cover && <h1 dir="auto" className="font-guest-display text-[40px] font-bold leading-[1.02] tracking-[-0.035em]">{headline}</h1>}
        {company.about && <p dir="auto" className="mt-3 whitespace-pre-line text-base leading-relaxed text-[#6B6B74]">{company.about}</p>}
        {facts.length > 0 && <p className="mt-3 text-[15px] font-semibold">{facts.join(' · ')}</p>}
      </div>
    </>
  )
}
