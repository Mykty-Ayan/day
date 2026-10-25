import type { MouseEvent, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { KeyRound, MapPin, MessageCircle, ScrollText, Wallet, Wifi } from 'lucide-react'
import { getGuestPanel, markGuestLeft, type GuestPanel } from '../../api/public'
import { mapLinks, panelButtons, waLink, type PanelButton } from '../../lib/guest-panel'
import { money, retryNetwork } from '../../lib/public-stay'
import { GuestFrame, LoadFailed } from './GuestFrame'

/** A guest's own page for their booking: the stay, the address, what is left to pay,
 *  how to get in once paid, the rules, and buttons that write to the host. */
export default function GuestPanelPage({ code }: { code: string }) {
  return <GuestFrame only={['ru', 'kz', 'en']}>{(locale) => <Panel code={code} locale={locale} />}</GuestFrame>
}

function Panel({ code, locale }: { code: string; locale: string }) {
  const { t } = useTranslation()
  const panel = useQuery({ queryKey: ['guest-panel', code], queryFn: () => getGuestPanel(code), retry: retryNetwork })
  if (panel.isPending) return <p className="p-6 text-sm text-gray-500">{t('guest.loading')}</p>
  if (!panel.data) {
    return <LoadFailed error={panel.error} onRetry={() => void panel.refetch()} gone={{ 404: t('guestPanel.notFound') }} />
  }
  return <PanelView code={code} panel={panel.data} locale={locale} />
}

const day = (iso: string, locale: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long' })

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-2xl border border-gray-200 p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

function PanelView({ code, panel, locale }: { code: string; panel: GuestPanel; locale: string }) {
  const { t } = useTranslation()
  const { booking: b, flat, access, company } = panel
  const dates = b ? `${day(b.check_in, locale)} — ${day(b.check_out, locale)}` : ''
  const checkIn = b?.check_in.slice(11, 16) ?? ''
  const checkOut = b?.check_out.slice(11, 16) ?? ''

  function message(key: PanelButton): string {
    const intro = t('guestPanel.wa.intro', { name: panel.guest_name ?? '', dates, flat: flat?.name ?? '' })
    if (key === 'question') return intro
    return `${intro} ${t(`guestPanel.wa.${key}`, { amount: money(b?.remaining ?? 0, locale), checkIn, checkOut })}`
  }

  /** «I have left»: Day is told first (the host hears it, the flat gets a cleaning
   *  task), then WhatsApp opens; a failed request does not keep the guest from writing. */
  async function leave(event: MouseEvent, url: string) {
    event.preventDefault()
    await markGuestLeft(code).catch(() => undefined)
    window.location.assign(url)
  }

  const buttons = panelButtons(panel)
  const button = (key: PanelButton) => (
    <a
      key={key}
      href={waLink(company!.whatsapp!, message(key))}
      target="_blank"
      rel="noopener noreferrer"
      onClick={key === 'checkedOut' ? (event) => leave(event, waLink(company!.whatsapp!, message(key))) : undefined}
      className={`flex min-h-12 items-center gap-2 rounded-xl px-4 text-sm font-semibold ${
        key === 'cannotGetIn' ? 'bg-red-600 text-white' : 'border border-gray-200 text-gray-900'
      }`}
    >
      <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
      {t(`guestPanel.buttons.${key}`)}
    </a>
  )

  return (
    <div className="space-y-4 p-4">
      <header className="space-y-1">
        {company && <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{company.title}</p>}
        <h1 className="text-xl font-bold text-gray-900">{flat?.name}</h1>
        {panel.guest_name && <p className="text-sm text-gray-600">{t('guestPanel.hello', { name: panel.guest_name })}</p>}
        {b && (
          <p className="text-sm text-gray-900">
            {t('guestPanel.stay', { from: day(b.check_in, locale), checkIn, to: day(b.check_out, locale), checkOut })}
          </p>
        )}
      </header>

      {panel.closed ? (
        <p role="status" className="rounded-2xl bg-gray-100 p-4 text-sm text-gray-700">{t('guestPanel.closed')}</p>
      ) : (
        <>
          {flat && (flat.address || flat.map_url || flat.latitude != null) && (
            <Section icon={<MapPin className="h-4 w-4" aria-hidden />} title={t('guestPanel.address')}>
              {flat.address && <p className="text-sm text-gray-700">{flat.address}</p>}
              <div className="flex flex-wrap gap-2">
                {[...(flat.map_url ? [{ name: t('guestPanel.map'), url: flat.map_url }] : []), ...mapLinks(flat)].map((m) => (
                  <a key={m.name} href={m.url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center rounded-xl border border-gray-200 px-3 text-sm font-semibold">
                    {m.name}
                  </a>
                ))}
              </div>
            </Section>
          )}

          {b && b.remaining > 0 && (
            <Section icon={<Wallet className="h-4 w-4" aria-hidden />} title={t('guestPanel.payment')}>
              <p className="text-sm text-gray-700">
                {t('guestPanel.paid', { paid: money(b.paid, locale), total: money(b.total, locale) })}
              </p>
              <p data-testid="guest-remaining" className="text-base font-bold text-gray-900">
                {t('guestPanel.remaining', { amount: money(b.remaining, locale) })}
              </p>
              {buttons.includes('pay') && button('pay')}
            </Section>
          )}

          {!access && (
            <Section icon={<KeyRound className="h-4 w-4" aria-hidden />} title={t('guestPanel.checkIn')}>
              <p className="text-sm text-gray-600">{t('guestPanel.codeOpens', { hours: panel.lead_hours })}</p>
            </Section>
          )}

          {access && (
            <Section icon={<KeyRound className="h-4 w-4" aria-hidden />} title={t('guestPanel.checkIn')}>
              {access.instructions && <p className="whitespace-pre-line text-sm text-gray-700">{access.instructions}</p>}
              {access.facts.map((fact) => (
                <p key={fact} className="whitespace-pre-line text-sm text-gray-700">{fact}</p>
              ))}
              {(access.wifi_name || access.wifi_password) && (
                <p className="flex items-center gap-2 text-sm text-gray-900">
                  <Wifi className="h-4 w-4 shrink-0" aria-hidden />
                  {[access.wifi_name, access.wifi_password].filter(Boolean).join(' · ')}
                </p>
              )}
            </Section>
          )}

          {flat && (
            <Section icon={<ScrollText className="h-4 w-4" aria-hidden />} title={t('guestPanel.rules')}>
              {flat.house_rules && <p className="whitespace-pre-line text-sm text-gray-700">{flat.house_rules}</p>}
              <p className="text-sm text-gray-700">{t('guestPanel.checkOutBy', { time: checkOut })}</p>
              {flat.check_out_instructions && (
                <p className="whitespace-pre-line text-sm text-gray-700">{flat.check_out_instructions}</p>
              )}
            </Section>
          )}
        </>
      )}

      {buttons.some((k) => k !== 'pay') && (
        <section aria-label={t('guestPanel.contact')} className="flex flex-col gap-2">
          {buttons.filter((k) => k !== 'pay').map(button)}
        </section>
      )}
    </div>
  )
}
