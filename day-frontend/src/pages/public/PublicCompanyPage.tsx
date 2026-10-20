import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, ChevronRight, Instagram, LayoutGrid, MessageCircle, Ruler, Users } from 'lucide-react'
import { getPublicCompany, type PublicCompany, type PublicCompanyFlat } from '../../api/public'
import { money, retryNetwork } from '../../lib/public-stay'
import { GuestFrame, LoadFailed } from './GuestFrame'

// Day's own green when the company has no color of its own.
const DEFAULT_ACCENT = '#047857'

/** A company's page for guests, opened by its link with no sign-in: who it is,
 *  how to write to it, its rules and its flats, each leading to the flat's page. */
export default function PublicCompanyPage({ slug }: { slug: string }) {
  return <GuestFrame>{(locale) => <Company slug={slug} locale={locale} />}</GuestFrame>
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
  const style = { '--accent': accent } as CSSProperties

  return (
    <main style={style} className="pb-10">
      <section className="relative">
        <div
          className="aspect-[16/9] w-full bg-cover bg-center"
          style={
            company.cover_url
              ? { backgroundImage: `url("${company.cover_url}")` }
              : { background: `linear-gradient(135deg, ${accent}, ${accent}99)` }
          }
          role={company.cover_url ? 'img' : undefined}
          aria-label={company.cover_url ? company.title : undefined}
        />
        {company.logo_url && (
          <img
            src={company.logo_url}
            alt=""
            className="absolute -bottom-9 start-5 h-[72px] w-[72px] rounded-2xl border-4 border-white bg-white object-cover shadow-md"
          />
        )}
      </section>

      <section className={`flex flex-col gap-3 px-5 ${company.logo_url ? 'pt-12' : 'pt-5'}`}>
        <h1 dir="auto" className="text-[28px] font-bold leading-tight tracking-tight">{company.title}</h1>
        {company.about && (
          <p dir="auto" className="whitespace-pre-line text-base leading-relaxed text-gray-700">{company.about}</p>
        )}
        <Contacts company={company} />
      </section>

      <section aria-labelledby="company-flats" className="mt-8 flex flex-col gap-4 px-5">
        <h2 id="company-flats" className="text-xl font-bold">
          {t('guestCompany.flats', { count: company.flats.length })}
        </h2>
        {company.flats.length === 0 && <p className="text-base text-gray-600">{t('guestCompany.noFlats')}</p>}
        {company.flats.map((flat) => (
          <FlatCard key={flat.code} flat={flat} locale={locale} />
        ))}
      </section>

      {company.rules.length > 0 && (
        <section aria-labelledby="company-rules" className="mx-5 mt-8 rounded-2xl bg-gray-50 p-5">
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
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-base font-semibold text-white"
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
          className="inline-flex h-12 items-center gap-2 rounded-xl border border-gray-200 px-4 text-base font-semibold text-gray-800"
        >
          <Instagram className="h-5 w-5" aria-hidden />@{company.instagram}
        </a>
      )}
    </div>
  )
}

function FlatCard({ flat, locale }: { flat: PublicCompanyFlat; locale: string }) {
  const { t } = useTranslation()
  const facts = [
    flat.rooms ? { icon: LayoutGrid, text: t('guest.rooms', { count: flat.rooms }) } : null,
    flat.max_guests ? { icon: Users, text: t('guest.guests', { count: flat.max_guests }) } : null,
    flat.area_total ? { icon: Ruler, text: t('guest.area', { area: flat.area_total.toLocaleString(locale) }) } : null,
  ].filter(Boolean) as { icon: typeof Users; text: string }[]

  return (
    <a
      href={`/s/${flat.code}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="aspect-[4/3] w-full bg-gray-100">
        {flat.photo && <img src={flat.photo} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
      </div>
      <div className="flex flex-col gap-2 p-4">
        {flat.complex_name && <span dir="auto" className="text-sm text-gray-600">{flat.complex_name}</span>}
        <span className="flex items-center justify-between gap-2">
          <span dir="auto" className="text-lg font-bold leading-snug">{flat.name}</span>
          <ChevronRight className="h-5 w-5 shrink-0 text-gray-400 rtl:rotate-180" aria-hidden />
        </span>
        {facts.length > 0 && (
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
            {facts.map(({ icon: Icon, text }) => (
              <span key={text} className="inline-flex items-center gap-1.5">
                <Icon className="h-4 w-4" aria-hidden />
                {text}
              </span>
            ))}
          </span>
        )}
        {(flat.night_price != null || flat.hour_price != null) && (
          <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-1">
            {flat.night_price != null && (
              <span>
                <span className="text-lg font-bold">{money(flat.night_price, locale)}</span>{' '}
                <span className="text-sm text-gray-600">{t('guest.perNight')}</span>
              </span>
            )}
            {flat.hour_price != null && (
              <span>
                <span className="text-lg font-bold">{money(flat.hour_price, locale)}</span>{' '}
                <span className="text-sm text-gray-600">{t('guest.perHour')}</span>
              </span>
            )}
          </span>
        )}
      </div>
    </a>
  )
}
