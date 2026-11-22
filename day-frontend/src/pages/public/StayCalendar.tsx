import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, format, parseISO } from 'date-fns'
import { CalendarDays, Rows2 } from 'lucide-react'
import { isDayBlocked } from '../../lib/booking-dates'
import { SITE_MAX_NIGHTS, money, stayQuote, takenDays, type PublicNight } from '../../lib/public-stay'

type Range = { checkIn: string | null; checkOut: string | null }

const iso = (d: Date) => format(d, 'yyyy-MM-dd')
const next = (day: string, n = 1) => iso(addDays(parseISO(day), n))

/** The flat's free dates as the approved mockup (28.10): a week strip with the price under
 *  each day, or the months one under another; quick picks above, the picked stay below. */
export function StayCalendar({
  nights,
  today,
  locale,
  range,
  onRange,
  minNights,
  deposit,
  checkInHour,
  checkOutHour,
  byNight,
}: {
  nights: PublicNight[]
  today: string
  locale: string
  range: Range
  onRange: (next: Range) => void
  minNights: number | null
  deposit: number | null
  checkInHour: number | null
  checkOutHour: number | null
  /** Quick picks of nights only where the flat sells nights. */
  byNight: boolean
}) {
  const { t } = useTranslation()
  const { checkIn, checkOut } = range
  const [view, setView] = useState<'week' | 'month'>('week')
  const [shownMonth, setShownMonth] = useState(today.slice(0, 7))
  const strip = useRef<HTMLDivElement>(null)
  const months = useRef<HTMLDivElement>(null)

  const free = useMemo(() => new Set(nights.filter((n) => n.free).map((n) => n.date)), [nights])
  const prices = useMemo(() => new Map(nights.map((n) => [n.date, n.price])), [nights])
  // From this week's Monday to the day after the last night loaded: whole weeks for the strip.
  const days = useMemo(() => {
    const first = parseISO(today)
    const monday = addDays(first, -((first.getDay() + 6) % 7))
    const last = nights.at(-1)?.date ?? today
    const out: string[] = []
    for (let d = monday; iso(d) <= next(last) || out.length % 7 !== 0; d = addDays(d, 1)) out.push(iso(d))
    return out
  }, [today, nights])
  // A night the page has not loaded counts as taken, to the calendar's last cell.
  const taken = useMemo(() => takenDays(nights, days.at(-1) ?? today), [nights, days, today])
  const byMonth = useMemo(() => {
    const groups = new Map<string, string[]>()
    for (const day of days) if (day >= today) groups.set(day.slice(0, 7), [...(groups.get(day.slice(0, 7)) ?? []), day])
    return [...groups.entries()]
  }, [days, today])

  const weekdays = t('guest.weekdays').split(' ')
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' })
  const weekdayLong = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' })
  const dayLong = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' })
  const dayShort = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' })
  const number = new Intl.NumberFormat(locale)

  const count = checkIn && checkOut ? Math.round((parseISO(checkOut).getTime() - parseISO(checkIn).getTime()) / 864e5) : 0
  const total = checkIn && checkOut ? stayQuote(nights, checkIn, checkOut).total : 0
  const short = count > 0 && minNights != null && count < minNights ? minNights : null

  // The month in the header: the strip's Thursday, or the top month of the list.
  function onStripScroll() {
    const el = strip.current
    if (!el) return
    const week = Math.round(Math.abs(el.scrollLeft) / el.clientWidth)
    const thursday = days[week * 7 + 3]
    if (thursday) setShownMonth(thursday.slice(0, 7))
  }
  function onMonthsScroll() {
    const el = months.current
    if (!el) return
    const top = [...el.querySelectorAll<HTMLElement>('[data-month]')].filter((m) => m.offsetTop - el.offsetTop <= el.scrollTop + 40).at(-1)
    if (top?.dataset.month) setShownMonth(top.dataset.month)
  }

  // Show a day: the strip turns to its week, the list scrolls to its month.
  function reveal(day: string) {
    if (view === 'week' && strip.current) {
      const week = Math.floor(days.indexOf(day) / 7)
      const dir = document.documentElement.dir === 'rtl' ? -1 : 1
      strip.current.scrollTo({ left: dir * week * strip.current.clientWidth, behavior: 'smooth' })
    } else if (months.current) {
      const cell = months.current.querySelector<HTMLElement>(`[data-night="${day}"]`)
      if (cell) months.current.scrollTo({ top: cell.offsetTop - months.current.offsetTop - 40, behavior: 'smooth' })
    }
  }
  // A new view opens on the stay picked, or on today.
  const anchor = checkIn ?? today
  useEffect(() => {
    if (view === 'week' && strip.current) {
      const week = Math.floor(Math.max(0, days.indexOf(anchor)) / 7)
      strip.current.scrollLeft = (document.documentElement.dir === 'rtl' ? -1 : 1) * week * strip.current.clientWidth
    }
    if (view === 'month' && months.current) {
      const cell = months.current.querySelector<HTMLElement>(`[data-night="${anchor}"]`)
      months.current.scrollTop = cell ? cell.offsetTop - months.current.offsetTop - 40 : 0
    }
    setShownMonth(anchor.slice(0, 7))
    // Only when the view changes: the guest's own scrolling stays theirs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // From the state as it is now: a day past the next taken night starts a new stay.
  function pick(day: string) {
    onRange(
      checkIn && !checkOut && day > checkIn && !isDayBlocked(day, taken, checkIn)
        ? { checkIn, checkOut: day }
        : { checkIn: day, checkOut: null },
    )
  }

  // A quick pick: n nights from today, or from the nearest day with n free nights in a row.
  function quick(n: number, fromTodayOnly: boolean): Range | null {
    for (let start = today; prices.has(start); start = next(start)) {
      let ok = true
      for (let k = 0; k < n && ok; k++) ok = free.has(next(start, k))
      if (ok) return { checkIn: start, checkOut: next(start, n) }
      if (fromTodayOnly) return null
    }
    return null
  }
  const picks = [
    { n: 1, label: t('guest.quickToday'), range: quick(1, true) },
    { n: 2, label: t('guest.quickNights', { count: 2 }), range: quick(2, false) },
    { n: 3, label: t('guest.quickNights', { count: 3 }), range: quick(3, false) },
    { n: 7, label: t('guest.quickWeek'), range: quick(7, false) },
  ]

  function cell(day: string) {
    const past = day < today
    // Past the next taken night a free day is not a check-out, but it can start a new stay.
    const off = !past && isDayBlocked(day, taken, checkIn && !checkOut ? checkIn : null) && taken.has(day)
    const edge = day === checkIn || day === checkOut
    const inside = Boolean(checkIn && checkOut && day > checkIn && day < checkOut)
    const band = inside || Boolean(checkIn && checkOut && edge)
    const price = prices.get(day)
    const label = past
      ? ''
      : day === checkIn
        ? t('guest.dayIn')
        : day === checkOut
          ? t('guest.dayOut')
          : taken.has(day)
            ? t('guest.taken')
            : price != null && free.has(day)
              ? number.format(price)
              : ''
    return (
      <button
        key={day}
        type="button"
        data-night={day}
        disabled={past || off}
        onClick={() => pick(day)}
        aria-pressed={edge || inside}
        aria-label={`${dayLong.format(parseISO(day))}${taken.has(day) && !past ? `, ${t('guest.taken')}` : ''}`}
        className="relative flex flex-col items-center pb-0.5 pt-1"
      >
        {band && (
          <span
            aria-hidden
            className={`absolute top-1 h-10 bg-[color-mix(in_srgb,var(--accent)_16%,white)] ${
              day === checkIn ? 'inset-x-0 start-1/2' : day === checkOut ? 'inset-x-0 end-1/2' : 'inset-x-0'
            }`}
          />
        )}
        <span
          className={`relative z-[1] flex h-10 w-10 items-center justify-center rounded-full text-xl font-medium ${
            edge
              ? 'bg-[var(--accent)] font-bold text-[var(--on-accent)]'
              : inside || day === today
                ? 'font-bold text-[var(--accent)]'
                : past
                  ? 'text-[#C7C7CC]'
                  : off
                    ? 'text-[#C7C7CC] line-through'
                    : ''
          }`}
        >
          {Number(day.slice(8))}
        </span>
        <span className={`mt-0.5 h-[13px] text-[10px] leading-[13px] ${edge || inside ? 'font-semibold text-[var(--accent)]' : 'text-[#76767F]'}`}>{label}</span>
      </button>
    )
  }

  const [year, month] = shownMonth.split('-').map(Number)
  const lead = (day: string) => (parseISO(day).getDay() + 6) % 7

  return (
    <section id="dates" aria-labelledby="free-dates" className="m-2 scroll-mt-4 rounded-[28px] bg-white p-5">
      {/* The heading for a screen reader: the month says it to the eye. */}
      <h2 id="free-dates" className="sr-only">{t('guest.freeDates')}</h2>
      <div className="flex items-center justify-between gap-2">
        <p aria-hidden className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="font-guest-display text-2xl font-bold capitalize tracking-[-0.03em]">{monthName.format(new Date(year, month - 1, 1))}</span>
          <span className="text-sm font-semibold text-[#76767F]">{year}</span>
        </p>
        <div className="flex items-center gap-1">
          <div role="radiogroup" aria-label={t('guest.calendarView')} className="flex rounded-xl bg-[#F3F3F6] p-[3px]">
            {(['week', 'month'] as const).map((v) => {
              const Icon = v === 'week' ? Rows2 : CalendarDays
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  aria-label={t(v === 'week' ? 'guest.viewWeek' : 'guest.viewMonth')}
                  onClick={() => setView(v)}
                  className={`flex h-8 w-9 items-center justify-center rounded-[9px] ${view === v ? 'bg-white text-[var(--accent)] shadow-[0_1px_3px_rgba(17,17,20,0.12)]' : 'text-[#76767F]'}`}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden />
                </button>
              )
            })}
          </div>
          <button type="button" onClick={() => reveal(today)} className="ms-1 h-11 px-1 text-[15px] font-semibold text-[var(--accent)]">
            {t('guest.today')}
          </button>
        </div>
      </div>

      {byNight && (
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {picks.map(({ n, label, range: r }) => {
            const on = r && checkIn === r.checkIn && checkOut === r.checkOut
            return (
              <button
                key={n}
                type="button"
                disabled={!r || (minNights != null && n < minNights)}
                aria-pressed={Boolean(on)}
                onClick={() => {
                  if (!r) return
                  onRange(r)
                  reveal(r.checkIn!)
                }}
                className={`h-9 whitespace-nowrap rounded-full px-0.5 text-[13.5px] font-semibold disabled:text-[#B4B4BD] ${on ? 'bg-[#111114] text-white' : 'bg-[#F3F3F6] text-[#111114]'}`}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      <div aria-hidden className="mt-3.5 grid grid-cols-7 text-center text-xs font-semibold text-[#76767F]">
        {weekdays.map((d, n) => (
          <span key={d} className={n >= 5 ? 'text-[#A0A0AA]' : ''}>{d}</span>
        ))}
      </div>

      {view === 'week' ? (
        <div ref={strip} onScroll={onStripScroll} className="mt-1.5 flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]">
          {days.map((day, n) => (
            <div key={day} className={`flex-[0_0_calc(100%/7)] ${n % 7 === 0 ? 'snap-start [scroll-snap-stop:always]' : ''}`}>
              {cell(day)}
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={months}
          onScroll={onMonthsScroll}
          className="mt-1 h-[380px] overflow-y-auto [mask-image:linear-gradient(#000_88%,transparent)] [scrollbar-width:none]"
        >
          {byMonth.map(([key, list]) => (
            <div key={key} data-month={key} className="pb-2.5">
              <h3 className="px-1.5 pb-1 pt-2.5 text-[15px] font-bold capitalize text-[var(--accent)]">
                {monthName.format(parseISO(`${key}-01`))}
              </h3>
              <div className="grid grid-cols-7">
                {Array.from({ length: lead(list[0]) }, (_, n) => <span key={n} />)}
                {list.map(cell)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div aria-live="polite" className="mt-1.5 border-t border-[#EEEEF2] px-1 pt-3 text-center text-[15px] font-semibold">
        {!checkIn ? (
          t('guest.pickCheckIn')
        ) : !checkOut ? (
          <>
            <span className="first-letter:uppercase">{t('guest.checkInOn', { day: weekdayLong.format(parseISO(checkIn)) })}</span>{' '}
            <span className="font-medium text-[#76767F]">{t('guest.pickCheckOut')}</span>
          </>
        ) : (
          <>
            {dayLong.format(parseISO(checkIn))} → {dayLong.format(parseISO(checkOut))}{' '}
            <span className="font-medium text-[#76767F]">
              · <span>{t('guest.nights', { count })}</span>
            </span>
            {short != null && <span className="mt-1 block text-sm text-[#8A5A00]">{t('guest.minNights', { count: short })}</span>}
            {count > SITE_MAX_NIGHTS && <span className="mt-1 block text-sm text-[#8A5A00]">{t('guest.maxSiteNights', { n: SITE_MAX_NIGHTS })}</span>}
          </>
        )}
        {checkIn && (
          <button type="button" onClick={() => onRange({ checkIn: null, checkOut: null })} className="mx-auto mt-1.5 block h-9 text-sm font-semibold text-[var(--accent)]">
            {t('guest.resetDates')}
          </button>
        )}
      </div>

      {checkIn && checkOut && (
        <div className="mt-3 flex justify-between gap-3 border-t border-[#EEEEF2] pt-3 text-[13px]">
          <div className="flex flex-col">
            <span className="text-[#76767F]">{t('guest.checkIn')}</span>
            <b className="text-[15px]">
              {dayShort.format(parseISO(checkIn))}
              {checkInHour != null && `, ${t('guest.from', { hour: checkInHour })}`}
            </b>
          </div>
          <div className="flex flex-col text-end">
            <span className="text-[#76767F]">{t('guest.checkOut')}</span>
            <b className="text-[15px]">
              {dayShort.format(parseISO(checkOut))}
              {checkOutHour != null && `, ${t('guest.until', { hour: checkOutHour })}`}
            </b>
          </div>
        </div>
      )}

      <div aria-hidden className="mt-3 flex flex-wrap gap-4 text-[13px] text-[#76767F]">
        <span className="inline-flex items-center gap-1.5"><i className="h-3.5 w-3.5 rounded-full bg-[#F3F3F6]" />{t('guest.legendFree')}</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-3.5 w-3.5 rounded-full border border-[#C3C3CB]" />{t('guest.taken')}</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-3.5 w-3.5 rounded-full bg-[var(--accent)]" />{t('guest.legendMine')}</span>
      </div>

      {checkIn && checkOut && short == null && (
        <div className="mt-4 rounded-[20px] bg-[#F3F3F6] p-4">
          <div className="flex justify-between py-1 text-[15px]">
            <span>{t('guest.nights', { count })}</span>
            <span data-testid="stay-total">{money(total, locale)}</span>
          </div>
          {deposit != null && (
            <div className="flex justify-between gap-3 py-1 text-[15px] text-[#76767F]">
              <span>{t('guest.depositLine')}</span>
              <span className="whitespace-nowrap">{money(deposit, locale)}</span>
            </div>
          )}
          <p className="mt-1.5 text-[13px] text-[#76767F]">{t('guest.totalHint')}</p>
        </div>
      )}
    </section>
  )
}
