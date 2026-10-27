import { useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  CalendarPlus,
  Check,
  Circle,
  Clock,
  Copy,
  FileText,
  KeyRound,
  Lock,
  LogOut,
  MapPin,
  MessageCircle,
  Navigation,
  ScrollText,
  ShoppingBag,
  Sparkles,
  Sunrise,
  Wallet,
  Wifi,
  Wrench,
  X,
} from 'lucide-react'
import { getGuestPanel, markGuestLeft, type GuestPanel } from '../../api/public'
import { accessOpensAt, accessTimeReached, mapLinks, nightsOf, panelButtons, stageOf, waLink, type PanelButton } from '../../lib/guest-panel'
import { money, onAccent, retryNetwork } from '../../lib/public-stay'
import { GuestFrame, LoadFailed } from './GuestFrame'
import { GuestMinibar } from './GuestMinibar'

// Day's own green when the company has no color of its own, as on the flat's page.
const DEFAULT_ACCENT = '#047857'

const ICONS: Record<PanelButton, typeof Wallet> = {
  pay: Wallet,
  earlyCheckIn: Sunrise,
  cannotGetIn: KeyRound,
  extend: CalendarPlus,
  lateCheckOut: Clock,
  cleaning: Sparkles,
  broken: Wrench,
  documents: FileText,
  checkedOut: LogOut,
  question: MessageCircle,
}

/** A guest's own page for their booking: the stay, what is left to pay, how to get
 *  in once paid, the address, the rules, the minibar, and a way to write to the host. */
export default function GuestPanelPage({ code }: { code: string }) {
  return (
    <GuestFrame only={['ru', 'kz', 'en']} overlay>
      {(locale) => <Panel code={code} locale={locale} />}
    </GuestFrame>
  )
}

function Panel({ code, locale }: { code: string; locale: string }) {
  const { t } = useTranslation()
  const panel = useQuery({ queryKey: ['guest-panel', code], queryFn: () => getGuestPanel(code), retry: retryNetwork })
  if (panel.isPending) return <p className="p-6 pt-20 text-sm text-gray-500">{t('guest.loading')}</p>
  if (!panel.data) {
    return (
      <div className="pt-16">
        <LoadFailed error={panel.error} onRetry={() => void panel.refetch()} gone={{ 404: t('guestPanel.notFound') }} />
      </div>
    )
  }
  return <PanelView code={code} panel={panel.data} locale={locale} />
}

// The stored times are the flat's wall clock: read them as such, whatever the phone's zone.
const wallClock = (iso: string) => new Date(`${iso.slice(0, 16)}:00`)

function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string; id?: string; 'aria-label'?: string }) {
  return (
    <section
      {...rest}
      className={`rounded-3xl bg-white p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.06)] ${className}`}
    >
      {children}
    </section>
  )
}

function CardTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2.5 text-[17px] font-semibold text-gray-900">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">{icon}</span>
      {children}
    </h2>
  )
}

/** One value the guest types into their phone (the Wi-Fi password): big, with a copy button. */
function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-stone-50 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-gray-500">{label}</p>
        <p dir="ltr" className="break-all text-lg font-semibold tabular-nums text-gray-900">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
          })
        }}
        aria-label={`${copied ? t('guestPanel.copied') : t('guestPanel.copy')}: ${label}`}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 transition-colors ${
          copied ? 'bg-emerald-600 text-white ring-emerald-600' : 'bg-white text-[var(--accent)] ring-gray-200'
        }`}
      >
        {copied ? <Check className="h-5 w-5" aria-hidden /> : <Copy className="h-5 w-5" aria-hidden />}
      </button>
    </div>
  )
}

/** A sheet from the bottom of the screen, over a dimmed page. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-overlay flex items-end justify-center bg-black/40 motion-safe:animate-[fade-in_200ms_ease-out]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
        className="max-h-[85vh] w-full max-w-[640px] overflow-y-auto rounded-t-3xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 motion-safe:animate-[sheet-up_250ms_cubic-bezier(.2,.8,.2,1)]"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-200" aria-hidden />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t('guest.close')} className="flex h-11 w-11 items-center justify-center rounded-full bg-stone-100">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

type Open = 'help' | 'rules' | 'checkout' | 'maps' | null

function PanelView({ code, panel, locale }: { code: string; panel: GuestPanel; locale: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<Open>(null)
  // A second tap while the first «I have left» is on its way tells the host nothing new.
  const leaving = useRef(false)
  const { booking: b, flat, access, company } = panel
  const color = company?.accent_color ?? DEFAULT_ACCENT
  const style = {
    '--accent': color,
    '--on-accent': onAccent(color),
    '--accent-soft': `color-mix(in oklab, ${color} 12%, white)`,
  } as CSSProperties

  const longDay = (iso: string) => wallClock(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long' })
  const shortDay = (iso: string) => wallClock(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  const weekday = (iso: string) => wallClock(iso).toLocaleDateString(locale, { weekday: 'short' })
  const dates = b ? `${longDay(b.check_in)} — ${longDay(b.check_out)}` : ''
  const checkIn = b?.check_in.slice(11, 16) ?? ''
  const checkOut = b?.check_out.slice(11, 16) ?? ''
  const stage = stageOf(panel)
  const buttons = panelButtons(panel)
  // On arrival day «cannot get in» has its own red card; any other day it is one of the reasons.
  const helpButtons = buttons.filter((k) => k !== 'pay' && !(k === 'cannotGetIn' && stage === 'arrival'))
  const maps = flat ? [...(flat.map_url ? [{ name: t('guestPanel.map'), url: flat.map_url }] : []), ...mapLinks(flat)] : []
  const opensAt = accessOpensAt(panel)
  const paidInFull = b ? b.paid >= b.total : false
  const timeReached = accessTimeReached(panel, new Date().toTimeString().slice(0, 5))

  function message(key: PanelButton): string {
    const intro = t('guestPanel.wa.intro', { name: panel.guest_name ?? '', dates, flat: flat?.name ?? '' })
    if (key === 'question') return intro
    return `${intro} ${t(`guestPanel.wa.${key}`, { amount: money(b?.remaining ?? 0, locale), checkIn, checkOut })}`
  }
  const href = (key: PanelButton) => waLink(company!.whatsapp!, message(key))

  /** «I have left»: Day is told first (the host hears it, the flat gets a cleaning
   *  task), then WhatsApp opens; a failed request does not keep the guest from writing. */
  async function leave(event: MouseEvent) {
    event.preventDefault()
    if (leaving.current) return
    leaving.current = true
    await markGuestLeft(code).catch(() => undefined)
    window.location.assign(href('checkedOut'))
  }

  const reason = (key: PanelButton) => {
    const Icon = ICONS[key]
    return (
      <a
        key={key}
        href={href(key)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={key === 'checkedOut' ? leave : undefined}
        className="flex min-h-14 items-center gap-3 rounded-2xl px-2 text-[15px] font-medium text-gray-900 active:bg-stone-100"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        {t(`guestPanel.buttons.${key}`)}
      </a>
    )
  }

  const quick: { key: string; label: string; icon: typeof Wallet; onClick?: () => void; href?: string; locked?: boolean }[] = []
  if (maps.length > 0) quick.push({ key: 'route', label: t('guestPanel.quick.route'), icon: Navigation, onClick: () => setOpen('maps') })
  if (!panel.closed) {
    quick.push({
      key: 'wifi',
      label: t('guestPanel.quick.wifi'),
      icon: access ? Wifi : Lock,
      locked: !access,
      onClick: () => document.getElementById('check-in')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    })
  }
  if (panel.menu) {
    quick.push({
      key: 'minibar',
      label: t('guestPanel.quick.minibar'),
      icon: ShoppingBag,
      onClick: () => document.getElementById('minibar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    })
  }
  if (helpButtons.length > 0) quick.push({ key: 'write', label: t('guestPanel.quick.write'), icon: MessageCircle, onClick: () => setOpen('help') })

  return (
    <div style={style} className="min-h-screen bg-stone-50 pb-10">
      {/* The flat's photo, or the company's color when it has none. */}
      <header className="relative h-[44vh] max-h-80 min-h-60 overflow-hidden bg-[var(--accent)]">
        {flat?.photo_url && <img src={flat.photo_url} alt="" className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/30" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 space-y-1 px-5 pb-16 text-white">
          {company && (
            <p dir="auto" className="flex items-center gap-2 text-[13px] font-medium text-white/85">
              {company.logo_url && <img src={company.logo_url} alt="" className="h-6 w-6 rounded-md object-cover" />}
              {company.title}
            </p>
          )}
          {panel.guest_name && <p className="text-[15px] text-white/90">{t('guestPanel.hello', { name: panel.guest_name })}</p>}
          <h1 dir="auto" className="font-guest-display text-[30px] font-bold leading-tight tracking-tight">{flat?.name}</h1>
        </div>
      </header>

      <div className="relative -mt-12 space-y-3 px-4">
        {b && (
          <Card aria-label={t('guestPanel.trip')} className="!p-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div>
                <p className="text-[13px] text-gray-500">{t('guestPanel.checkInLabel')}</p>
                <p className="text-[17px] font-semibold tabular-nums">{shortDay(b.check_in)}</p>
                <p className="text-[13px] tabular-nums text-gray-500">{weekday(b.check_in)}, {checkIn}</p>
              </div>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-[13px] font-medium text-gray-600">
                {b.rental_mode === 'hourly' ? `${checkIn}–${checkOut}` : t('guestPanel.nights', { count: nightsOf(b) })}
              </span>
              <div className="text-end">
                <p className="text-[13px] text-gray-500">{t('guestPanel.checkOutLabel')}</p>
                <p className="text-[17px] font-semibold tabular-nums">{shortDay(b.check_out)}</p>
                <p className="text-[13px] tabular-nums text-gray-500">{weekday(b.check_out)}, {checkOut}</p>
              </div>
            </div>
            <div className="mt-3 border-t border-stone-100 pt-3">
              {panel.closed ? (
                <span className="inline-flex rounded-full bg-stone-100 px-3 py-1 text-[13px] font-semibold text-gray-600">{t('guestPanel.statusClosed')}</span>
              ) : b.remaining > 0 ? (
                <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-[13px] font-semibold text-amber-900">
                  {t('guestPanel.statusDue', { amount: money(b.remaining, locale) })}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-[13px] font-semibold text-emerald-900">
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  {t('guestPanel.statusPaid')}
                </span>
              )}
            </div>
          </Card>
        )}

        {quick.length > 0 && (
          <nav aria-label={t('guestPanel.quickActions')} className="grid grid-flow-col auto-cols-fr gap-2 py-1">
            {quick.map(({ key, label, icon: Icon, onClick, locked }) => (
              <button key={key} type="button" onClick={onClick} className="flex flex-col items-center gap-1.5">
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_12px_rgb(0_0_0/0.06)] ${
                    locked ? 'text-gray-400' : 'text-[var(--accent)]'
                  }`}
                >
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <span className="text-xs font-medium text-gray-700">{label}</span>
              </button>
            ))}
          </nav>
        )}

        {panel.closed ? (
          <Card>
            <p role="status" className="text-[15px] text-gray-700">{t('guestPanel.closed')}</p>
            {helpButtons.length > 0 && <div className="mt-3 flex flex-col">{helpButtons.map(reason)}</div>}
          </Card>
        ) : (
          <>
            {buttons.includes('cannotGetIn') && stage === 'arrival' && (
              <a
                href={href('cannotGetIn')}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-3xl bg-red-600 px-5 py-4 text-white shadow-[0_8px_24px_rgb(220_38_38/0.25)]"
              >
                <KeyRound className="h-6 w-6 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">{t('guestPanel.buttons.cannotGetIn')}</span>
                  <span className="block text-[13px] text-white/85">{t('guestPanel.cannotGetInHint')}</span>
                </span>
              </a>
            )}

            {stage === 'departure' && buttons.includes('checkedOut') && (
              <Card>
                <CardTitle icon={<LogOut className="h-4 w-4" aria-hidden />}>{t('guestPanel.departureToday', { time: checkOut })}</CardTitle>
                {flat?.check_out_instructions && (
                  <p dir="auto" className="mb-3 whitespace-pre-line text-[15px] leading-relaxed text-gray-700">{flat.check_out_instructions}</p>
                )}
                <a
                  href={href('checkedOut')}
                  onClick={leave}
                  className="flex min-h-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-[15px] font-semibold text-[var(--on-accent)]"
                >
                  {t('guestPanel.buttons.checkedOut')}
                </a>
              </Card>
            )}

            {b && b.remaining > 0 && (
              <Card aria-label={t('guestPanel.payment')}>
                <CardTitle icon={<Wallet className="h-4 w-4" aria-hidden />}>{t('guestPanel.payment')}</CardTitle>
                <p data-testid="guest-remaining" className="text-[28px] font-bold tabular-nums tracking-tight text-gray-900">
                  {money(b.remaining, locale)}
                </p>
                <p className="text-[13px] text-gray-500">{t('guestPanel.paid', { paid: money(b.paid, locale), total: money(b.total, locale) })}</p>
                {(b.orders_due ?? 0) > 0 && (
                  <p className="text-[13px] text-gray-500">{t('guestPanel.ordersDue', { amount: money(b.orders_due ?? 0, locale) })}</p>
                )}
                {buttons.includes('pay') && (
                  <a
                    href={href('pay')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-[15px] font-semibold text-[var(--on-accent)]"
                  >
                    <Wallet className="h-5 w-5" aria-hidden />
                    {t('guestPanel.buttons.pay')}
                  </a>
                )}
              </Card>
            )}

            <Card id="check-in" aria-label={t('guestPanel.checkIn')} className="scroll-mt-4">
              <CardTitle icon={access ? <KeyRound className="h-4 w-4" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}>
                {t('guestPanel.checkIn')}
              </CardTitle>
              {access ? (
                <div className="space-y-3 motion-safe:animate-[fade-in_400ms_ease-out]">
                  {access.instructions && (
                    <p dir="auto" className="whitespace-pre-line text-[15px] leading-relaxed text-gray-800">{access.instructions}</p>
                  )}
                  {access.facts.map((fact) => (
                    <p key={fact} dir="auto" className="whitespace-pre-line rounded-2xl bg-stone-50 px-4 py-3 text-[15px] text-gray-800">{fact}</p>
                  ))}
                  {access.wifi_name && <CopyRow label={t('guestPanel.wifiNetwork')} value={access.wifi_name} />}
                  {access.wifi_password && <CopyRow label={t('guestPanel.wifiPassword')} value={access.wifi_password} />}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* What is behind the lock, as a blur: the guest sees there is a code to come. */}
                  <div aria-hidden className="select-none space-y-2 rounded-2xl bg-stone-50 px-4 py-3 blur-[5px]">
                    <p className="text-lg font-semibold tracking-[0.3em]">•••• ••</p>
                    <p className="text-[15px]">Wi-Fi •••••••• · ••••••</p>
                  </div>
                  <ul className="space-y-2 text-[15px]">
                    <li className="flex items-center gap-2.5">
                      {paidInFull ? <Check className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden /> : <Circle className="h-5 w-5 shrink-0 text-gray-300" aria-hidden />}
                      <span className={paidInFull ? 'text-gray-500' : 'text-gray-900'}>{t('guestPanel.stepPaid')}</span>
                    </li>
                    {opensAt && (
                      <li className="flex items-center gap-2.5">
                        {timeReached ? <Check className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden /> : <Clock className="h-5 w-5 shrink-0 text-gray-300" aria-hidden />}
                        <span className={timeReached ? 'text-gray-500' : 'text-gray-900'}>
                          {timeReached
                            ? t('guestPanel.stepTimeDone', { hours: panel.lead_hours })
                            : t('guestPanel.stepTime', { when: `${longDay(opensAt)}, ${opensAt.slice(11, 16)}`, hours: panel.lead_hours })}
                        </span>
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </Card>

            {flat && (flat.address || maps.length > 0) && (
              <Card aria-label={t('guestPanel.address')}>
                <CardTitle icon={<MapPin className="h-4 w-4" aria-hidden />}>{t('guestPanel.address')}</CardTitle>
                {flat.address && <p dir="auto" className="text-[15px] text-gray-800">{flat.address}</p>}
                {maps.length > 0 && (
                  <div className="mt-3 grid grid-flow-col auto-cols-fr gap-1 rounded-2xl bg-stone-100 p-1">
                    {maps.map((m) => (
                      <a
                        key={m.name}
                        href={m.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-11 items-center justify-center rounded-xl bg-white text-sm font-semibold text-gray-900 shadow-sm"
                      >
                        {m.name}
                      </a>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {flat && (
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setOpen('rules')} className="flex flex-col items-start gap-3 rounded-3xl bg-white p-4 text-start shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.06)]">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                    <ScrollText className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="text-[15px] font-semibold text-gray-900">{t('guestPanel.rules')}</span>
                </button>
                <button type="button" onClick={() => setOpen('checkout')} className="flex flex-col items-start gap-3 rounded-3xl bg-white p-4 text-start shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.06)]">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                    <LogOut className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="text-[15px] font-semibold text-gray-900">{t('guestPanel.checkOutBy', { time: checkOut })}</span>
                </button>
              </div>
            )}

            {panel.menu && (
              <div id="minibar" className="scroll-mt-4">
                <GuestMinibar code={code} menu={panel.menu} locale={locale} />
              </div>
            )}

            {helpButtons.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen('help')}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-3xl bg-white text-[15px] font-semibold text-gray-900 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.06)]"
              >
                <MessageCircle className="h-5 w-5 text-[var(--accent)]" aria-hidden />
                {t('guestPanel.contact')}
              </button>
            )}
          </>
        )}
      </div>

      {open === 'help' && (
        <Sheet title={t('guestPanel.contact')} onClose={() => setOpen(null)}>
          <p className="mb-2 text-[13px] text-gray-500">{t('guestPanel.helpHint')}</p>
          <div className="flex flex-col">{helpButtons.map(reason)}</div>
        </Sheet>
      )}
      {open === 'maps' && (
        <Sheet title={t('guestPanel.quick.route')} onClose={() => setOpen(null)}>
          {flat?.address && <p dir="auto" className="mb-3 text-[15px] text-gray-800">{flat.address}</p>}
          <div className="flex flex-col gap-2">
            {maps.map((m) => (
              <a key={m.name} href={m.url} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center gap-3 rounded-2xl bg-stone-50 px-4 text-[15px] font-semibold">
                <Navigation className="h-5 w-5 text-[var(--accent)]" aria-hidden />
                {m.name}
              </a>
            ))}
          </div>
        </Sheet>
      )}
      {open === 'rules' && flat && (
        <Sheet title={t('guestPanel.rules')} onClose={() => setOpen(null)}>
          <p dir="auto" className="whitespace-pre-line text-[15px] leading-relaxed text-gray-800">{flat.house_rules || '—'}</p>
        </Sheet>
      )}
      {open === 'checkout' && flat && (
        <Sheet title={t('guestPanel.checkOutBy', { time: checkOut })} onClose={() => setOpen(null)}>
          <p dir="auto" className="whitespace-pre-line text-[15px] leading-relaxed text-gray-800">{flat.check_out_instructions || '—'}</p>
        </Sheet>
      )}
    </div>
  )
}
