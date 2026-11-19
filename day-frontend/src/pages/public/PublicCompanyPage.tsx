import { useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Instagram, LayoutGrid, MessageCircle, Ruler, ShieldCheck, Users } from 'lucide-react'
import { getPublicCompany, type PublicCompany, type PublicCompanyFlat } from '../../api/public'
import { money, onAccent, retryNetwork } from '../../lib/public-stay'
import { GuestFrame, LoadFailed } from './GuestFrame'

// The mockup's blue when the company has no color of its own.
const DEFAULT_ACCENT = '#2F5BFF'

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
  // Filters by rooms, when the flats differ in them: the guest narrows the list in a tap.
  const roomCounts = [...new Set(company.flats.map((f) => f.rooms).filter((r): r is number => r != null && r > 0))].sort((a, b) => a - b)
  const [rooms, setRooms] = useState<number | null>(null)
  const shown = rooms == null ? company.flats : company.flats.filter((f) => f.rooms === rooms)

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
      </div>

      <div className="px-5 pb-4">
        <h1 dir="auto" className="font-guest-display text-[40px] font-bold leading-[1.02] tracking-[-0.035em]">{company.title}</h1>
        {company.about && <p dir="auto" className="mt-3 whitespace-pre-line text-base leading-relaxed text-[#76767F]">{company.about}</p>}
      </div>

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
          <h2 id="company-flats" className="font-guest-display text-[22px] font-bold tracking-[-0.025em]">{t('guestCompany.ourFlats')}</h2>
          <span className="text-sm text-[#76767F]">{company.flats.length}</span>
        </div>
        {roomCounts.length > 1 && (
          <div role="radiogroup" aria-label={t('guestCompany.byRooms')} className="flex gap-2 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
            {[null, ...roomCounts].map((n) => (
              <button
                key={n ?? 'all'}
                type="button"
                role="radio"
                aria-checked={rooms === n}
                onClick={() => setRooms(n)}
                className={`h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold ${rooms === n ? 'bg-[#111114] text-white' : 'bg-white'}`}
              >
                {n == null ? t('guestCompany.all') : t('guest.rooms', { count: n })}
              </button>
            ))}
          </div>
        )}
        {company.flats.length === 0 && <p className="m-2 rounded-[28px] bg-white p-5 text-base text-[#76767F]">{t('guestCompany.noFlats')}</p>}
        {shown.map((flat, n) => (
          <FlatTile key={flat.code} flat={flat} locale={locale} first={n === 0} />
        ))}
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
function FlatTile({ flat, locale, first }: { flat: PublicCompanyFlat; locale: string; first: boolean }) {
  const { t } = useTranslation()
  const facts = [
    flat.max_guests ? { icon: Users, text: t('guest.guests', { count: flat.max_guests }) } : null,
    flat.rooms ? { icon: LayoutGrid, text: t('guest.rooms', { count: flat.rooms }) } : null,
    flat.area_total ? { icon: Ruler, text: t('guest.area', { area: flat.area_total.toLocaleString(locale) }) } : null,
  ].filter(Boolean) as { icon: typeof Users; text: string }[]
  const price = flat.night_price ?? flat.hour_price

  return (
    <a href={`/s/${flat.code}`} className="m-2 block rounded-[28px] bg-white p-2 pb-4">
      <div className="relative h-[280px] overflow-hidden rounded-[22px] bg-[#111114]">
        {flat.photo && <img src={flat.photo} alt="" loading={first ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_45%,rgba(0,0,0,.6))]" aria-hidden />
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
          {price != null ? (
            <p className="flex items-baseline gap-1.5">
              <b className="text-2xl tracking-[-0.03em]">{money(price, locale)}</b>
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
