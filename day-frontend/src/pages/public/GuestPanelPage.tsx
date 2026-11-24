import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  CalendarPlus,
  CarTaxiFront,
  Check,
  CircleCheck,
  Clock,
  Copy,
  FileText,
  KeyRound,
  Lock,
  LogOut,
  MessageCircle,
  Navigation,
  ScrollText,
  SearchCheck,
  Sofa,
  Sparkles,
  Sunrise,
  Wallet,
  Wifi,
  Wrench,
  X,
} from 'lucide-react'
import { getGuestPanel, markGuestLeft, type GuestPanel } from '../../api/public'
import { accessOpensAt, accessTimeReached, canReportLeaving, mapLinks, nightsOf, panelButtons, stageOf, waLink, type PanelButton } from '../../lib/guest-panel'
import { dateRange, money, onAccent, retryNetwork } from '../../lib/public-stay'
import { GuestFrame, LoadFailed } from './GuestFrame'
import { GuestMinibar } from './GuestMinibar'

// The mockup's blue when the company has no color of its own, as on the flat's page.
const DEFAULT_ACCENT = '#2F5BFF'

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
// What the guest may need while staying: tiles on «In the flat».
const DURING: PanelButton[] = ['extend', 'lateCheckOut', 'cleaning', 'broken']

const CARD = 'm-2 rounded-[28px] bg-white p-5'
const H2 = 'font-guest-display mb-3 text-[22px] font-bold tracking-[-0.025em]'
const MUTE = 'text-[#6B6B74]'

type Tab = 'in' | 'stay' | 'out'

/** A guest's own page for their booking, as the approved mockup (28.10): the stay and
 *  how long until it, then by stage: getting in, in the flat, leaving. */
export default function GuestPanelPage({ code }: { code: string }) {
  return (
    <GuestFrame only={['ru', 'kz', 'en']} overlay="page" personal>
      {(locale) => <Panel code={code} locale={locale} />}
    </GuestFrame>
  )
}

function Panel({ code, locale }: { code: string; locale: string }) {
  const { t } = useTranslation()
  const panel = useQuery({ queryKey: ['guest-panel', code], queryFn: () => getGuestPanel(code), retry: retryNetwork })
  if (panel.isPending) return <p className="p-6 pt-20 text-sm text-[#6B6B74]">{t('guest.loading')}</p>
  if (!panel.data) {
    return (
      <div className="pt-16">
        <LoadFailed error={panel.error} onRetry={() => void panel.refetch()} gone={{ 404: t('guestPanel.notFound') }} />
      </div>
    )
  }
  return <PanelView code={code} panel={panel.data} locale={locale} receivedAt={panel.dataUpdatedAt} />
}

// The stored times are the flat's wall clock: read them as such, whatever the phone's zone.
const wallClock = (iso: string) => new Date(`${iso.slice(0, 16)}:00`)

/** A copy button for one value the guest types into their phone (the Wi-Fi password). */
function CopyButton({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        })
      }}
      aria-label={`${copied ? t('guestPanel.copied') : t('guestPanel.copy')}: ${label}`}
      className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full ${copied ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[#F3F3F6]'}`}
    >
      {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
    </button>
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
        className="max-h-[85vh] w-full max-w-[480px] overflow-y-auto rounded-t-[28px] bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 motion-safe:animate-[sheet-up_250ms_cubic-bezier(.2,.8,.2,1)]"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#E7E7ED]" aria-hidden />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t('guest.close')} className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F3F3F6]">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** The departure checklist: the host's instructions, a line each, ticked on this phone only. */
function Checklist({ text }: { text: string }) {
  const { t } = useTranslation()
  const lines = text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
  const [done, setDone] = useState<Set<number>>(new Set())
  if (lines.length < 2) return <p dir="auto" className="whitespace-pre-line text-[15px] leading-relaxed">{text}</p>
  return (
    <>
      <p className={`-mt-1 mb-2 text-sm ${MUTE}`}>
        {done.size === lines.length ? t('guestPanel.allDone') : t('guestPanel.doneOf', { done: done.size, total: lines.length })}
      </p>
      <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-[#F3F3F6]">
        <i className="block h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${(done.size / lines.length) * 100}%` }} />
      </div>
      {lines.map((line, n) => (
        <label key={n} className="flex cursor-pointer items-center gap-3 border-b border-[#E7E7ED] py-2.5 text-[15px] last:border-0">
          <input
            type="checkbox"
            checked={done.has(n)}
            onChange={() =>
              setDone((now) => {
                const next = new Set(now)
                if (next.has(n)) next.delete(n)
                else next.add(n)
                return next
              })
            }
            className="h-6 w-6 shrink-0 rounded-lg accent-[var(--accent)]"
          />
          <span dir="auto" className={done.has(n) ? `${MUTE} line-through` : ''}>{line}</span>
        </label>
      ))}
    </>
  )
}

function PanelView({ code, panel, locale, receivedAt }: { code: string; panel: GuestPanel; locale: string; receivedAt: number }) {
  const { t } = useTranslation()
  const [help, setHelp] = useState(false)
  // A second tap while the first «I have left» is on its way tells the host nothing new.
  const leaving = useRef(false)
  // Without the company's WhatsApp «I have left» goes to Day alone, and says so here.
  const [left, setLeft] = useState<'sent' | 'failed' | null>(null)
  const { booking: b, flat, access, company } = panel
  const stage = stageOf(panel)
  // The stage the guest is at opens first: before getting in, in the flat, leaving.
  const [tab, setTab] = useState<Tab>(stage === 'departure' || stage === null ? 'out' : stage === 'stay' || b?.status === 'checked_in' ? 'stay' : 'in')
  // The countdown moves with the clock.
  const [now, setNow] = useState(() => new Date())
  // The company's clock against the phone's at the answer: the countdown runs on the
  // company's wall clock whatever zone the phone is in.
  const skew = panel.now ? wallClock(panel.now).getTime() - receivedAt : 0
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const color = company?.accent_color ?? DEFAULT_ACCENT
  const style = {
    '--accent': color,
    '--on-accent': onAccent(color),
    '--accent-soft': `color-mix(in oklab, ${color} 16%, white)`,
  } as CSSProperties

  const longDay = (iso: string) => wallClock(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long' })
  const shortDay = (iso: string) => wallClock(iso).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
  const fullDay = (iso: string) => wallClock(iso).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
  const dates = b ? `${longDay(b.check_in)} — ${longDay(b.check_out)}` : ''
  // «4–6 нояб.» under the hello, the dates in short as the mockup.
  const stayRange = b
    ? dateRange(new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }), wallClock(b.check_in), wallClock(b.check_out))
    : ''
  const checkIn = b?.check_in.slice(11, 16) ?? ''
  const checkOut = b?.check_out.slice(11, 16) ?? ''
  const buttons = panelButtons(panel)
  // On arrival day «cannot get in» has its own red card; any other day it is one of the reasons.
  const helpButtons = buttons.filter((k) => k !== 'pay' && !(k === 'cannotGetIn' && stage === 'arrival'))
  const maps = flat ? [...(flat.map_url ? [{ name: t('guestPanel.map'), url: flat.map_url }] : []), ...mapLinks(flat)] : []
  // Under the address: the complex and the floor always, the entrance and the flat's number with the way in.
  const where = [
    flat?.complex_name,
    access?.entrance ? t('guestPanel.entrance', { n: access.entrance }) : null,
    access?.block ? t('guestPanel.block', { n: access.block }) : null,
    flat?.floor != null ? t('guestPanel.floor', { n: flat.floor }) : null,
    access?.apartment_number ? t('guestPanel.apartment', { n: access.apartment_number }) : null,
  ].filter(Boolean)
  // Yandex Go to the door, by the flat's point (Yandex's own link format, the app's redirect id).
  const taxi =
    flat?.latitude != null && flat.longitude != null
      ? `https://3.redirect.appmetrica.yandex.com/route?end-lat=${flat.latitude}&end-lon=${flat.longitude}&ref=day&appmetrica_tracking_id=1178268795219780156`
      : null
  // Extending: until the next guest arrives, when there is a free night after this stay.
  const freeUntil = b?.free_until && b.free_until > b.check_out.slice(0, 10) ? t('guestPanel.freeUntil', { day: longDay(`${b.free_until}T00:00`) }) : null
  const hint = (key: PanelButton) => (key === 'extend' ? freeUntil : null)
  const opensAt = accessOpensAt(panel)
  const paidInFull = b ? b.paid >= b.total : false
  // What is owed for the minibar is the server's figure, part of remaining: one rule
  // for the guest's page, the Mini App and the booking card.
  const minibarDue = b?.orders_due ?? 0
  const due = b?.remaining ?? 0
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

  /** «I have left» with no WhatsApp to open: Day is told, and the page says it was. */
  async function leaveQuietly() {
    if (leaving.current) return
    leaving.current = true
    try {
      await markGuestLeft(code)
      setLeft('sent')
    } catch {
      leaving.current = false
      setLeft('failed')
    }
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
        className="flex min-h-14 items-center gap-3 rounded-2xl px-2 text-[15px] font-medium text-[#111114] active:bg-[#F3F3F6]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F3F3F6]">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        {t(`guestPanel.buttons.${key}`)}
      </a>
    )
  }

  // How long until the next step, by the flat's wall clock against the phone's: hours on
  // the day itself, days before. A guest in another time zone sees the hours off by it.
  function countdown(iso: string): string {
    const minutes = Math.round((wallClock(iso).getTime() - (now.getTime() + skew)) / 60_000)
    if (minutes <= 0) return ''
    if (iso.slice(0, 10) === panel.today) return t('guestPanel.inHours', { h: Math.floor(minutes / 60), m: minutes % 60 })
    const days = Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(panel.today)) / 86_400_000)
    return t('guestPanel.inDays', { count: days })
  }
  const heroLines = (): [string, string] => {
    if (!b || panel.closed) return ['', t('guestPanel.statusClosed')]
    // Past the check-out day and not closed yet: the host has not marked it.
    if (stage === null) return [t('guestPanel.leaveOn', { day: shortDay(b.check_out), time: checkOut }), t('guestPanel.timeToLeave')]
    if (stage === 'departure') return [t('guestPanel.leaveToday', { time: checkOut }), countdown(b.check_out) || t('guestPanel.timeToLeave')]
    if (stage === 'stay' || b.status === 'checked_in') return [t('guestPanel.leaveOn', { day: shortDay(b.check_out), time: checkOut }), t('guestPanel.welcome')]
    return [
      stage === 'arrival' ? t('guestPanel.arriveToday', { time: checkIn }) : t('guestPanel.arriveOn', { day: shortDay(b.check_in), time: checkIn }),
      // The hour has come: in with the way in open, else the code still waits for the payment.
      countdown(b.check_in) || (access ? t('guestPanel.canEnter') : t('guestPanel.doorAfterPay')),
    ]
  }
  const [line1, line2] = heroLines()
  // On check-out, and still once the booking is closed: the deposit's fate and the flat to book again.
  // A deposit never paid on a booking that closed (a hold that ran out, a cancel) is no
  // money of the guest's: nothing to come back, nothing to show.
  const depositShown = panel.deposit && !(panel.closed && panel.deposit.status === 'pending')
  const depositCard = depositShown && panel.deposit ? (
                <section aria-label={t('guestPanel.deposit.title')} className={CARD}>
                  <h2 className={H2}>{t('guestPanel.deposit.title')}</h2>
                  <p className="text-[30px] font-bold tracking-[-0.03em]">{money(panel.deposit.amount, locale)}</p>
                  <p className={`text-sm ${panel.deposit.status === 'returned' ? 'text-[#157A3A]' : MUTE}`}>
                    {t(`guestPanel.deposit.${panel.deposit.status}`, {
                      back: money(panel.deposit.amount - panel.deposit.held, locale),
                      held: money(panel.deposit.held, locale),
                    })}
                  </p>
                  {/* Paid and waiting for the stay's end: how it comes back, as the mockup. */}
                  {panel.deposit.status === 'paid' && (
                    <ol className="mt-3.5 flex flex-col gap-3">
                      {[
                        [LogOut, t('guestPanel.deposit.step1', { time: checkOut })],
                        [SearchCheck, t('guestPanel.deposit.step2')],
                        [Wallet, t('guestPanel.deposit.step3')],
                      ].map(([Icon, text], n) => {
                        const StepIcon = Icon as typeof Wallet
                        return (
                          <li key={n} className="flex items-center gap-3 text-[15px] font-semibold">
                            <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full ${n === 0 ? 'bg-[var(--accent)] text-[var(--on-accent)]' : 'bg-[#F3F3F6]'}`}>
                              <StepIcon className="h-4 w-4" aria-hidden />
                            </span>
                            {text as string}
                          </li>
                        )
                      })}
                    </ol>
                  )}
                </section>
              ) : null
  const againCard = flat?.code ? (
                <section className={CARD}>
                  <b className="block text-lg">{t('guestPanel.again.title')}</b>
                  <p className={`mt-1 text-sm leading-relaxed ${MUTE}`}>{t('guestPanel.again.text')}</p>
                  <a href={`/s/${flat.code}`} className="mt-3 flex h-12 items-center justify-center rounded-full bg-[#111114] text-[15px] font-semibold text-white">
                    {t('guestPanel.again.open')}
                  </a>
                </section>
              ) : null
  const chip = 'inline-flex h-7 items-center gap-1.5 rounded-full bg-white/20 px-2.5 text-xs font-semibold backdrop-blur-md'

  const wifi = access && (access.wifi_name || access.wifi_password) && (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[26px] bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#F3F3F6]"><Wifi className="h-[18px] w-[18px]" aria-hidden /></span>
        {access.wifi_password && <CopyButton label={t('guestPanel.wifiPassword')} value={access.wifi_password} />}
      </div>
      {access.wifi_name && (
        <span className={`text-xs ${MUTE}`}>
          <span dir="ltr">{access.wifi_name}</span>
          {access.wifi_password && ` · ${t('guestPanel.password')}`}
        </span>
      )}
      <b dir="ltr" className="break-all text-[17px]">{access.wifi_password ?? access.wifi_name}</b>
      {!access.wifi_password && access.wifi_name && <CopyButton label={t('guestPanel.wifiNetwork')} value={access.wifi_name} />}
    </div>
  )

  return (
    <div style={style} className={`min-h-screen bg-[#EDEDF2] text-[#111114] ${helpButtons.length > 0 && !panel.closed ? 'pb-28' : 'pb-8'}`}>
      {/* Hello and the stay in a line; the language button floats at its end (GuestFrame). */}
      <div className="flex items-center gap-3 px-4 pb-1 pe-24 pt-4">
        <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-lg font-bold text-[var(--accent)]">
          {(panel.guest_name ?? flat?.name ?? '·').trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          {/* By the first name, as a host greets: «Дана К.» is said «Дана». */}
          {panel.guest_name && <p className="truncate text-lg font-bold tracking-[-0.02em]">{t('guestPanel.hello', { name: panel.guest_name.trim().split(/\s+/)[0] })}</p>}
          <div className={`flex min-w-0 gap-1 text-[13px] ${MUTE}`}>
            <h1 dir="auto" className="truncate">{flat?.name}</h1>
            {b && <span className="shrink-0">· {stayRange}</span>}
          </div>
        </div>
      </div>

      {/* The flat's photo with how long until the next step, as the mockup. */}
      <section aria-label={t('guestPanel.trip')} className="relative m-2 h-[236px] overflow-hidden rounded-[30px] bg-[#111114] text-white">
        {flat?.photo_url && <img src={flat.photo_url} alt="" className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.05)_30%,rgba(0,0,0,.72))]" aria-hidden />
        <span className="absolute start-3.5 top-3.5 inline-flex h-9 items-center gap-1.5 rounded-full border border-white/30 bg-white/20 px-3.5 text-sm font-semibold backdrop-blur-md">
          <Lock className="h-4 w-4" aria-hidden />
          {t('guestPanel.yourLink')}
        </span>
        <div className="absolute inset-x-[18px] bottom-4">
          {line1 && <p className="text-[13px] font-semibold opacity-80">{line1}</p>}
          <p className="font-guest-display mb-2.5 mt-0.5 text-[30px] font-bold leading-[1.1] tracking-[-0.03em]">{line2}</p>
          {b && (
            <div className="flex flex-wrap gap-1.5">
              <span className={chip}>
                {b.rental_mode === 'hourly' ? `${checkIn}–${checkOut}` : t('guestPanel.nights', { count: nightsOf(b) })}
              </span>
              {!panel.closed && (b.status === 'confirmed' || b.status === 'checked_in') && (
                <span className={chip}>
                  <CircleCheck className="h-3.5 w-3.5 text-[#4ADE80]" aria-hidden />
                  {t('guestPanel.confirmed')}
                </span>
              )}
              {!panel.closed &&
                (b.remaining > 0 ? (
                  <span className={`${chip} !bg-[#FFF3DC] text-[#8A5A00]`}>{t('guestPanel.statusDue', { amount: money(b.remaining, locale) })}</span>
                ) : (
                  <span className={chip}>
                    <CircleCheck className="h-3.5 w-3.5 text-[#4ADE80]" aria-hidden />
                    {t('guestPanel.statusPaid')}
                  </span>
                ))}
            </div>
          )}
        </div>
      </section>

      {panel.closed ? (
        <section className={CARD}>
          <p role="status" className="text-[15px] text-[#2A2A30]">{t('guestPanel.closed')}</p>
          {helpButtons.length > 0 && <div className="mt-3 flex flex-col">{helpButtons.map(reason)}</div>}
        </section>
      ) : null}
      {panel.closed && depositCard}
      {panel.closed && againCard}
      {panel.closed ? null : (
        <>
          {helpButtons.length > 0 && !panel.closed && (
            // As the mockup: help is one tap away on every stage. Before the stages in the page,
            // so the minibar's cart, later, floats over it.
            <div className="fixed inset-x-0 bottom-0 z-sticky px-2.5 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5">
              <div className="mx-auto flex max-w-[460px] items-center justify-between gap-2.5 rounded-full bg-white/90 py-2 pe-2 ps-[22px] shadow-[0_10px_30px_rgba(17,17,20,0.12)] backdrop-blur-xl">
                <div className="min-w-0">
                  <b className="block truncate text-[15px]">{t('guestPanel.needHelp')}</b>
                  <span className={`block text-[13px] ${MUTE}`}>{t('guestPanel.inWhatsApp')}</span>
                </div>
                <button type="button" onClick={() => setHelp(true)} className="flex h-14 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-[#111114] pe-1.5 ps-4 text-[15px] font-semibold text-white">
                  {t('guestPanel.writeHost')}
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)]">
                    <MessageCircle className="h-5 w-5" aria-hidden />
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* What is owed shows on every stage: the minibar on the tab is part of it. */}
      {b && due > 0 && (
        <section aria-label={t('guestPanel.payment')} className={CARD}>
          <h2 className={H2}>{t('guestPanel.payment')}</h2>
          <p data-testid="guest-remaining" className="text-[30px] font-bold tabular-nums tracking-[-0.03em]">{money(due, locale)}</p>
          <p className={`text-sm ${MUTE}`}>{t('guestPanel.paid', { paid: money(b.paid, locale), total: money(b.total, locale) })}</p>
          {minibarDue > 0 && (
            <p data-testid="guest-minibar-due" className={`text-sm ${MUTE}`}>{t('guestPanel.ordersDue', { amount: money(minibarDue, locale) })}</p>
          )}
          {buttons.includes('pay') && (
            <a
              href={href('pay')}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex h-[52px] items-center justify-center gap-2 rounded-full bg-[#111114] text-base font-semibold text-white"
            >
              <Wallet className="h-5 w-5" aria-hidden />
              {t('guestPanel.buttons.pay')}
            </a>
          )}
        </section>
      )}

          <div className="sticky top-0 z-sticky bg-[linear-gradient(#EDEDF2_80%,transparent)] px-2 pb-1.5 pt-2">
            <div role="tablist" aria-label={t('guestPanel.stages')} className="grid grid-cols-3 rounded-2xl bg-[#E2E2E9] p-1">
              {(
                [
                  ['in', KeyRound, t('guestPanel.tabs.in')],
                  ['stay', Sofa, t('guestPanel.tabs.stay')],
                  ['out', LogOut, t('guestPanel.tabs.out')],
                ] as const
              ).map(([key, Icon, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={`flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold ${
                    // A tab not picked sits on the tab bar's grey: a shade darker than the page's grey text.
                    tab === key ? 'bg-white text-[#111114] shadow-[0_1px_4px_rgba(17,17,20,0.12)]' : 'text-[#5C5C66]'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {tab === 'in' && (
            <div role="tabpanel">
              {buttons.includes('cannotGetIn') && stage === 'arrival' && (
                <a
                  href={href('cannotGetIn')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="m-2 flex items-center gap-3 rounded-[28px] bg-red-600 px-5 py-4 text-white shadow-[0_8px_24px_rgb(220_38_38/0.25)]"
                >
                  <KeyRound className="h-6 w-6 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold">{t('guestPanel.buttons.cannotGetIn')}</span>
                    <span className="block text-[13px] text-white/85">{t('guestPanel.cannotGetInHint')}</span>
                  </span>
                </a>
              )}

              {/* Tiles as a smart home's: the way in, the Wi-Fi, the time. */}
              <section id="check-in" aria-label={t('guestPanel.checkIn')} className="m-2 grid scroll-mt-16 grid-cols-2 gap-2">
                <div className="row-span-2 flex min-w-0 flex-col justify-between gap-3 rounded-[26px] bg-[#111114] p-4 text-white">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-white/55">{t('guestPanel.checkIn')}</h2>
                  {access ? (
                    <div className="flex flex-col gap-2 motion-safe:animate-[fade-in_400ms_ease-out]">
                      {access.instructions && <p dir="auto" className="whitespace-pre-line text-[15px] leading-snug">{access.instructions}</p>}
                      {access.facts.map((fact) => (
                        <p key={fact} dir="auto" className="whitespace-pre-line rounded-2xl bg-white/[0.12] px-3 py-2 text-[15px] font-semibold">{fact}</p>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <Lock className="h-8 w-8 text-[#8FA8FF]" aria-hidden />
                      <p className="text-[13px] leading-snug text-white/70">{t('guestPanel.doorLater')}</p>
                      <ul className="flex flex-col gap-1.5 text-[13px]">
                        <li className="flex items-center gap-2">
                          {paidInFull ? <Check className="h-4 w-4 shrink-0 text-[#4ADE80]" aria-hidden /> : <span className="h-4 w-4 shrink-0 rounded-full border-2 border-white/40" aria-hidden />}
                          <span className={paidInFull ? 'text-white/55' : ''}>{t('guestPanel.stepPaid')}</span>
                        </li>
                        {opensAt && (
                          <li className="flex items-center gap-2">
                            {timeReached ? <Check className="h-4 w-4 shrink-0 text-[#4ADE80]" aria-hidden /> : <Clock className="h-4 w-4 shrink-0 text-white/40" aria-hidden />}
                            <span className={timeReached ? 'text-white/55' : ''}>
                              {timeReached
                                ? t('guestPanel.stepTimeDone', { hours: panel.lead_hours })
                                : t('guestPanel.stepTime', { when: `${longDay(opensAt)}, ${opensAt.slice(11, 16)}`, hours: panel.lead_hours })}
                            </span>
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
                {wifi || (
                  <div className="flex min-w-0 flex-col gap-1.5 rounded-[26px] bg-white p-4">
                    <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#F3F3F6] text-[#A0A0AA]"><Lock className="h-[18px] w-[18px]" aria-hidden /></span>
                    <span className={`text-xs ${MUTE}`}>{t('guestPanel.quick.wifi')}</span>
                    <b className="text-[17px] tracking-[0.2em] text-[#C3C3CB]" aria-hidden>••••••</b>
                  </div>
                )}
                {b && (
                  <div className="flex min-w-0 flex-col gap-1.5 rounded-[26px] bg-white p-4">
                    <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#F3F3F6]"><Clock className="h-[18px] w-[18px]" aria-hidden /></span>
                    <span className={`text-xs ${MUTE}`}>{t('guestPanel.checkInLabel')} · {shortDay(b.check_in)}</span>
                    <b className="text-[17px]">{t('guestPanel.fromTime', { time: checkIn })}</b>
                  </div>
                )}
              </section>

              {flat && (flat.address || maps.length > 0 || where.length > 0) && (
                <section aria-label={t('guestPanel.address')} className={CARD}>
                  <h2 className={H2}>{t('guestPanel.address')}</h2>
                  {flat.address && <p dir="auto" className="text-[17px] font-semibold">{flat.address}</p>}
                  {where.length > 0 && <p dir="auto" className={`mt-0.5 text-sm ${MUTE}`}>{where.join(' · ')}</p>}
                  {maps.length > 0 && (
                    <div className={`mt-3 grid gap-2 ${maps.length > 3 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                      {maps.map((m) => (
                        <a key={m.name} href={m.url} target="_blank" rel="noopener noreferrer" className="flex h-[46px] items-center justify-center gap-1.5 rounded-full bg-[#F3F3F6] text-sm font-semibold">
                          <Navigation className="h-4 w-4 shrink-0" aria-hidden />
                          {m.name}
                        </a>
                      ))}
                    </div>
                  )}
                  {taxi && (
                    <a href={taxi} target="_blank" rel="noopener noreferrer" className="mt-2 flex h-[46px] items-center justify-center gap-2 rounded-full bg-[#F3F3F6] text-[15px] font-semibold">
                      <CarTaxiFront className="h-[18px] w-[18px]" aria-hidden />
                      {t('guestPanel.taxi')}
                    </a>
                  )}
                </section>
              )}

              {/* The path to the door, as the mockup: the owner's check-in photos, a step each. */}
              {!!access?.photos?.length && (
                <section aria-label={t('guestPanel.path')} className={CARD}>
                  <h2 className={H2}>{t('guestPanel.path')}</h2>
                  <ol className="flex flex-col">
                    {access.photos.map((photo, n) => (
                      <li key={photo.url} className="relative grid grid-cols-[28px_76px_1fr] items-start gap-3 pb-4 last:pb-0">
                        {n < access.photos!.length - 1 && <span aria-hidden className="absolute bottom-0 start-[13px] top-7 w-0.5 bg-[#E4E4EA]" />}
                        <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-[#111114] text-[13px] font-bold text-white">{n + 1}</span>
                        <a href={photo.url} target="_blank" rel="noopener noreferrer" className="block h-[76px] w-[76px] overflow-hidden rounded-[18px] bg-[#F3F3F6]">
                          <img src={photo.url} alt={photo.caption ?? t('guestPanel.pathStep', { n: n + 1 })} loading="lazy" className="h-full w-full object-cover" />
                        </a>
                        {photo.caption && <p dir="auto" className="pt-1 text-[15px] font-semibold leading-snug">{photo.caption}</p>}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          )}

          {/* Kept mounted while another stage is open: the minibar's cart and note stay as the guest left them. */}
          <div role="tabpanel" hidden={tab !== 'stay'}>
              {tab === 'stay' && wifi && <div className="m-2 grid grid-cols-2 gap-2">{wifi}</div>}
              {/* An empty minibar is not shown: nothing to order, nothing ordered. */}
              {panel.menu && (panel.menu.length > 0 || (panel.orders?.length ?? 0) > 0) && (
                <div id="minibar" className="m-2 scroll-mt-16">
                  <GuestMinibar code={code} menu={panel.menu} minibar={panel.minibar} orders={panel.orders} locale={locale} />
                </div>
              )}
              {tab === 'stay' && DURING.some((k) => buttons.includes(k)) && (
                <section className={CARD}>
                  <h2 className={H2}>{t('guestPanel.needMore')}</h2>
                  <div className="grid grid-cols-2 gap-2">
                    {DURING.filter((k) => buttons.includes(k)).map((key) => {
                      const Icon = ICONS[key]
                      return (
                        <a key={key} href={href(key)} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-2.5 rounded-[20px] bg-[#F3F3F6] p-3.5 text-sm font-semibold leading-tight">
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white"><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
                          {t(`guestPanel.buttons.${key}`)}
                          {hint(key) && <span className={`-mt-1.5 text-xs font-normal ${MUTE}`}>{hint(key)}</span>}
                        </a>
                      )
                    })}
                  </div>
                </section>
              )}
              {tab === 'stay' && flat?.house_rules && (
                <section className={CARD}>
                  <h2 className={H2}>{t('guestPanel.rules')}</h2>
                  <p dir="auto" className="flex items-start gap-3 whitespace-pre-line text-[15px] leading-relaxed">
                    <ScrollText className={`mt-0.5 h-5 w-5 shrink-0 ${MUTE}`} aria-hidden />
                    {flat.house_rules}
                  </p>
                </section>
              )}
          </div>

          {tab === 'out' && b && (
            <div role="tabpanel">
              {/* Dark on its own: CARD's white would win over another background in the stylesheet. */}
              <section data-testid="leave-card" className="m-2 rounded-[28px] bg-[#111114] p-5 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-white/55">{t('guestPanel.checkOutLabel')}</p>
                <p className="mb-0.5 mt-1.5 text-[26px] font-bold leading-[1.15] tracking-[-0.03em] first-letter:uppercase">
                  {fullDay(b.check_out)}, {t('guestPanel.untilTime', { time: checkOut })}
                </p>
                {countdown(b.check_out) && <p className="text-sm text-white/65">{countdown(b.check_out)}</p>}
                {(['extend', 'lateCheckOut'] as const).some((k) => buttons.includes(k)) && (
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {(['extend', 'lateCheckOut'] as const)
                      .filter((k) => buttons.includes(k))
                      .map((key) => {
                        const Icon = ICONS[key]
                        return (
                          <a key={key} href={href(key)} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-1.5 rounded-[18px] bg-white/10 p-3 text-[15px] font-semibold">
                            <Icon className="h-[18px] w-[18px] text-[#8FA8FF]" aria-hidden />
                            {t(`guestPanel.buttons.${key}`)}
                            {hint(key) && <span className="text-xs font-normal text-white/60">{hint(key)}</span>}
                          </a>
                        )
                      })}
                  </div>
                )}
              </section>

              {(flat?.check_out_instructions || canReportLeaving(panel)) && (
                <section className={CARD}>
                  <h2 className={H2}>{t('guestPanel.beforeLeaving')}</h2>
                  {flat?.check_out_instructions && <Checklist text={flat.check_out_instructions} />}
                  {buttons.includes('checkedOut') ? (
                    <a href={href('checkedOut')} onClick={leave} className="mt-4 flex h-[52px] items-center justify-center rounded-full bg-[#111114] text-base font-semibold text-white">
                      {t('guestPanel.buttons.checkedOut')}
                    </a>
                  ) : canReportLeaving(panel) && left === 'sent' ? (
                    <p role="status" className="mt-4 rounded-2xl bg-[#E8F7EE] px-4 py-3 text-[15px] font-medium text-[#17663A]">{t('guestPanel.leftSent')}</p>
                  ) : canReportLeaving(panel) ? (
                    <>
                      <button type="button" onClick={() => void leaveQuietly()} className="mt-4 flex h-[52px] w-full items-center justify-center rounded-full bg-[#111114] text-base font-semibold text-white">
                        {t('guestPanel.buttons.checkedOut')}
                      </button>
                      {left === 'failed' && <p role="alert" className="mt-2 text-sm text-[#8A5A00]">{t('guestPanel.leftFailed')}</p>}
                    </>
                  ) : null}
                </section>
              )}

              {depositCard}

              <section className={CARD}>
                <h2 className={H2}>{t('guestPanel.payment')}</h2>
                <p className="flex justify-between py-1.5 text-[15px]">
                  <span>{b.rental_mode === 'hourly' ? `${checkIn}–${checkOut}` : t('guestPanel.nights', { count: nightsOf(b) })}</span>
                  <b className="font-semibold">{money(b.total, locale)}</b>
                </p>
                {minibarDue > 0 && <p className={`py-1.5 text-[15px] ${MUTE}`}>{t('guestPanel.ordersDue', { amount: money(minibarDue, locale) })}</p>}
                <p className="flex justify-between py-1.5 text-[15px]">
                  <span>{b.remaining > 0 ? t('guestPanel.left') : t('guestPanel.statusPaid')}</span>
                  <b className={`font-semibold ${b.remaining > 0 ? 'text-[#8A5A00]' : 'text-[#157A3A]'}`}>{money(b.remaining > 0 ? b.remaining : b.paid, locale)}</b>
                </p>
              </section>

              {againCard}
            </div>
          )}
        </>
      )}

      {help && (
        <Sheet title={t('guestPanel.contact')} onClose={() => setHelp(false)}>
          <p className={`mb-2 text-[13px] ${MUTE}`}>{t('guestPanel.helpHint')}</p>
          <div className="flex flex-col">{helpButtons.map(reason)}</div>
        </Sheet>
      )}
    </div>
  )
}
