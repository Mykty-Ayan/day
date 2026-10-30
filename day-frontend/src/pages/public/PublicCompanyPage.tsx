import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Instagram, LayoutGrid, MessageCircle, Ruler, Users } from 'lucide-react'
import { getPublicCompany, type PublicCompany, type PublicCompanyFlat } from '../../api/public'
import { money, onAccent, retryNetwork } from '../../lib/public-stay'
import { GuestFrame, LoadFailed } from './GuestFrame'

// Day's own green when the company has no color of its own.
const DEFAULT_ACCENT = '#047857'

/** A company's page for guests, opened by its link with no sign-in: who it is,
 *  how to write to it, its rules and its flats, each leading to the flat's page. */
export default function PublicCompanyPage({ slug }: { slug: string }) {
  return <GuestFrame overlay>{(locale) => <Company slug={slug} locale={locale} />}</GuestFrame>
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
      {company.isPending && <p className="p-6 text-sm text-gray-500">{t('guest.loading')}</p>}
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

  return (
    <main style={style} className="pb-10">
      <HeroSection company={company} accent={accent} />

      <section className="flex flex-col gap-3 px-5 pt-5">
        {company.about && (
          <p dir="auto" className="whitespace-pre-line text-base leading-relaxed text-gray-700">{company.about}</p>
        )}
        <Contacts company={company} />
      </section>

      <section aria-labelledby="company-flats" className="mt-8 flex flex-col gap-4 px-3">
        <h2 id="company-flats" className="font-guest-display px-2 text-[22px] font-bold tracking-tight">
          {t('guestCompany.flats', { count: company.flats.length })}
        </h2>
        {company.flats.length === 0 && <p className="px-2 text-base text-gray-600">{t('guestCompany.noFlats')}</p>}
        {/* A board of pins: two columns, the photos at alternating heights so the eye keeps moving. */}
        <div className={company.flats.length > 1 ? 'columns-2 gap-3 sm:columns-3' : ''}>
          {company.flats.map((flat, n) => (
            <FlatPin key={flat.code} flat={flat} locale={locale} tall={company.flats.length > 1 && n % 3 === 0} />
          ))}
        </div>
      </section>

      {company.rules.length > 0 && (
        <section aria-labelledby="company-rules" className="mx-5 mt-8 rounded-[24px] bg-stone-50 p-5">
          <h2 id="company-rules" className="mb-3 text-lg font-bold">{t('guestCompany.rules')}</h2>
          <ul className="flex flex-col gap-2.5">
            {company.rules.map((rule) => (
              <li key={rule} className="flex items-start gap-2.5 text-[15px] leading-normal text-gray-800">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
                <span dir="auto">{rule}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="px-5 pt-8 text-xs text-gray-500">{t('guest.poweredBy')}</footer>
    </main>
  )
}

function Contacts({ company }: { company: PublicCompany }) {
  const { t } = useTranslation()
  if (!company.whatsapp && !company.instagram) return null
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {company.whatsapp && (
        <a
          href={`https://wa.me/${company.whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--accent)] px-5 text-base font-semibold text-[var(--on-accent)]"
        >
          <MessageCircle className="h-5 w-5" aria-hidden />
          {t('guestCompany.write')}
        </a>
      )}
      {company.instagram && (
        <a
          href={`https://instagram.com/${company.instagram}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 items-center gap-2 rounded-full bg-stone-100 px-4 text-base font-semibold text-gray-800"
        >
          <Instagram className="h-5 w-5" aria-hidden />@{company.instagram}
        </a>
      )}
    </div>
  )
}

// The company's cover, else its first flat's photo: the page opens on a picture, not a block of color.
function HeroSection({ company, accent }: { company: PublicCompany; accent: string }) {
  const picture = company.cover_url ?? company.flats.find((f) => f.photo)?.photo ?? null
  return (
    <section className="px-3 pt-3">
      <div className="relative overflow-hidden rounded-[28px]">
        {/* An <img>, not a CSS url(): the owner's link never becomes style text. */}
        {picture ? (
          <img src={picture} alt="" fetchPriority="high" className="aspect-[4/5] w-full object-cover sm:aspect-[16/9]" />
        ) : (
          <div className="aspect-[16/9] w-full" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}99)` }} />
        )}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-5 pt-24">
          {company.logo_url && (
            <img src={company.logo_url} alt="" className="h-14 w-14 rounded-2xl border-2 border-white/80 bg-white object-cover" />
          )}
          <h1 dir="auto" className="font-guest-display text-[34px] font-bold leading-[1.1] tracking-tight text-white">{company.title}</h1>
        </div>
      </div>
    </section>
  )
}

function FlatPin({ flat, locale, tall }: { flat: PublicCompanyFlat; locale: string; tall: boolean }) {
  const { t } = useTranslation()
  const facts = [
    flat.rooms ? { icon: LayoutGrid, text: t('guest.rooms', { count: flat.rooms }) } : null,
    flat.max_guests ? { icon: Users, text: t('guest.guests', { count: flat.max_guests }) } : null,
    flat.area_total ? { icon: Ruler, text: t('guest.area', { area: flat.area_total.toLocaleString(locale) }) } : null,
  ].filter(Boolean) as { icon: typeof Users; text: string }[]
  const price = flat.night_price ?? flat.hour_price

  return (
    <a href={`/s/${flat.code}`} className="mb-4 flex break-inside-avoid flex-col gap-2">
      <div className={`relative overflow-hidden rounded-[22px] bg-stone-100 ${tall ? 'aspect-[3/4]' : 'aspect-[4/5]'}`}>
        {flat.photo && <img src={flat.photo} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />}
        {price != null && (
          <span className="absolute bottom-2.5 start-2.5 rounded-full bg-white/95 px-3 py-1.5 text-sm font-bold shadow-sm">
            {money(price, locale)}
            <span className="font-medium text-gray-600"> {flat.night_price != null ? t('guest.perNight') : t('guest.perHour')}</span>
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 px-1">
        <span dir="auto" className="text-[15px] font-bold leading-snug">{flat.name}</span>
        {flat.complex_name && <span dir="auto" className="text-[13px] text-gray-600">{flat.complex_name}</span>}
        {facts.length > 0 && (
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-gray-600">
            {facts.map(({ icon: Icon, text }) => (
              <span key={text} className="inline-flex items-center gap-1">
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {text}
              </span>
            ))}
          </span>
        )}
      </div>
    </a>
  )
}
