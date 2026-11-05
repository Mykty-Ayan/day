import { useState } from 'react'
import { ArrowRight, Clock, Moon } from 'lucide-react'
import { useNavigate, Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { format, parseISO } from 'date-fns'
import { clearDayPrices, createBlock, deleteBlock, setDayPrices } from '../../api/properties'
import { useBooking } from '../../hooks/useBookings'
import { useCurrency } from '../../hooks/useCurrency'
import { useWeekendDays, useWeekendSettings } from '../../hooks/useSettings'
import { bookingMoney } from '../../lib/booking-money'
import { mainStep } from '../../lib/booking-steps'
import { addDays, barDays, busyOn, clock, freeWindows, hoursOn, nightlyRate, nightRuns, nightsBetween } from '../../lib/chessboard'
import { dateLocale } from '../../lib/date-locale'
import { formatMoneyExact } from '../../pages/miniapp/format'
import type { Booking, GanttBlock } from '../../types/booking'
import type { PricingConfig } from '../../types/property'
import BookingActions from '../booking/BookingActions'
import BookingBlocks from '../booking/BookingBlocks'
import BookingStatusBadge from '../booking/BookingStatusBadge'
import TakePaymentPanel from '../booking/TakePaymentPanel'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import { Sheet } from '../ui/sheet'
import { showToast } from '../ui/Toast'
import type { ChessSelection, ChessTool, GanttRow } from './GanttChart'

// Matches the backend DEFAULT_CHECK_IN_HOUR (14:00) used to seed hourly bookings.
const HOURLY_START = '14:00'

function useDates() {
  const { i18n } = useTranslation()
  const locale = dateLocale(i18n.language)
  const en = i18n.language === 'en'
  const day = (value: string) => format(parseISO(value), en ? 'MMMM d' : 'd MMMM', { locale })
  return {
    day,
    // "12–14 ноября", "29 ноября – 2 декабря": the nights picked, first and last.
    range: (first: string, last: string) => {
      if (first === last) return day(first)
      if (first.slice(0, 7) !== last.slice(0, 7)) return `${day(first)} – ${day(last)}`
      return en
        ? `${day(first)}–${format(parseISO(last), 'd', { locale })}`
        : `${format(parseISO(first), 'd', { locale })}–${day(last)}`
    },
  }
}

function useMoney() {
  const { i18n } = useTranslation()
  const { symbol } = useCurrency()
  // Exact: a price with tiyn is confirmed as it will be saved.
  return (value: number) => `${formatMoneyExact(value, i18n.language)} ${symbol}`
}

/** One write per flat: each goes on its own, and the panel says which did not. */
async function eachFlat(rows: GanttRow[], write: (row: GanttRow) => Promise<unknown>) {
  const failed: string[] = []
  for (const row of rows) {
    try {
      await write(row)
    } catch {
      failed.push(row.property.internal_name)
    }
  }
  return failed
}

const ROW = 'flex items-start justify-between gap-3 border-b border-line py-2.5 text-sm last:border-b-0'

export function SelectionPanel({
  tool,
  selection,
  rows,
  pricingByProperty,
  onClose,
  onDone,
}: {
  tool: ChessTool
  selection: ChessSelection | null
  rows: GanttRow[]
  pricingByProperty: Record<string, PricingConfig | null | undefined>
  onClose: () => void
  /** The change is made: the chessboard goes back to bookings. */
  onDone: () => void
}) {
  const { t } = useTranslation()
  const picked = selection ? rows.filter((row) => selection.propertyIds.includes(row.property.id)) : []
  const title = tool === 'booking' ? t('gantt.newTitle') : tool === 'price' ? t('gantt.priceTitle') : t('properties.blocks.add')
  return (
    <Sheet open={selection !== null} onClose={onClose} title={title}>
      {selection && tool === 'booking' && picked[0] && (
        <NewBooking row={picked[0]} selection={selection} pricing={pricingByProperty[picked[0].property.id]} />
      )}
      {selection && tool === 'price' && (
        <SetPrice rows={picked} selection={selection} pricingByProperty={pricingByProperty} onDone={onDone} />
      )}
      {selection && tool === 'close' && <CloseNights rows={picked} selection={selection} onDone={onDone} />}
    </Sheet>
  )
}

function Picked({ selection, flats }: { selection: ChessSelection; flats: string }) {
  const { t } = useTranslation()
  const dates = useDates()
  return (
    <div className="rounded-xl bg-surface-page px-4 py-3">
      <p className="text-sm font-bold text-ink">{flats}</p>
      <p className="mt-0.5 text-sm text-ink">
        {dates.range(selection.first, selection.last)}
        <span className="text-ink-muted"> · {t('gantt.nightCount', { count: nightsBetween(selection.first, selection.last).length })}</span>
      </p>
    </div>
  )
}

function NewBooking({ row, selection, pricing }: { row: GanttRow; selection: ChessSelection; pricing: PricingConfig | null | undefined }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const money = useMoney()
  const dates = useDates()
  const mode = row.property.rental_mode ?? 'daily'
  const nights = nightsBetween(selection.first, selection.last)
  const busy = busyOn(row, selection.first, selection.last)
  const priced = new Map((row.dayPrices ?? []).map((night) => [night.date, night.price]))
  const weekend = useWeekendDays()
  const rates = nights.map((night) => nightlyRate(pricing, night, priced.get(night), weekend))
  const sum = rates.every((rate) => rate !== null) ? rates.reduce<number>((a, b) => a + (b ?? 0), 0) : null
  const daily = mode !== 'hourly'
  const hourly = mode !== 'daily'
  const free = busy.bookings.length === 0 && busy.blocks.length === 0

  function open(search: Record<string, string>) {
    navigate({ to: '/bookings/new', search: { property_id: row.property.id, from: 'gantt', ...search } as Record<string, string> })
  }

  return (
    <div className="flex flex-col gap-4">
      <Picked selection={selection} flats={row.property.internal_name} />
      {daily && sum !== null && (
        <p className="text-sm text-ink">
          {t('gantt.newSum', { sum: money(sum) })}
          <span className="block text-xs text-ink-muted">{t('gantt.newSumHint')}</span>
        </p>
      )}
      {busy.bookings.map((booking) => (
        <p key={booking.id} role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
          {t('gantt.busyBooking', { guest: booking.guest_name, dates: dates.range(barDays(booking.check_in, booking.check_out).start, addDays(barDays(booking.check_in, booking.check_out).end, -1)) })}
        </p>
      ))}
      {busy.blocks.map((block) => (
        <p key={block.id} role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">
          {t('gantt.busyClosed', { reason: block.reason || t('gantt.closed') })}
        </p>
      ))}
      <div className="flex flex-col gap-2">
        {daily && (
          <Button
            disabled={!free}
            onClick={() => open({ check_in: selection.first, check_out: addDays(selection.last, 1) })}
          >
            {hourly ? t('gantt.bookDaily') : t('gantt.book')}
          </Button>
        )}
        {hourly && (
          <Button
            variant={daily ? 'secondary' : 'primary'}
            onClick={() => open({ check_in: `${selection.first}T${HOURLY_START}` })}
          >
            {t('gantt.bookHourly', { day: dates.day(selection.first) })}
          </Button>
        )}
        {hourly && nights.length > 1 && <p className="text-xs text-ink-muted">{t('gantt.hourlyFirstDay')}</p>}
      </div>
    </div>
  )
}

// Digits with spaces between thousands, and kopecks after a point or a comma.
// "25,000" is no 25: a comma with three digits after it is not a decimal one.
const MAX_PRICE = 99_999_999.99
function readPrice(text: string): number | null {
  const plain = text.replace(/\s+/g, '')
  if (!/^\d+([.,]\d{1,2})?$/.test(plain)) return null
  const value = Number(plain.replace(',', '.'))
  return value > 0 && value <= MAX_PRICE ? value : null
}

// Monday first, as a week is read here; the numbers are Date.getDay().
const WEEK = [1, 2, 3, 4, 5, 6, 0]
const weekday = (night: string) => parseISO(night).getDay()

function SetPrice({
  rows,
  selection,
  pricingByProperty,
  onDone,
}: {
  rows: GanttRow[]
  selection: ChessSelection
  pricingByProperty: Record<string, PricingConfig | null | undefined>
  onDone: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const money = useMoney()
  const [text, setText] = useState('')
  // The weekend nights' extra, on top of the price: one step instead of two passes by weekday.
  const [markupText, setMarkupText] = useState('')
  const [days, setDays] = useState<number[]>([...WEEK])
  // The company's weekend: the quick sets and the markup follow it, and wait for it:
  // a markup written by a guessed weekend would stay on the wrong nights.
  const { days: weekend, known: weekendKnown } = useWeekendSettings()
  const DAY_SETS = { all: WEEK, work: WEEK.filter((day) => !weekend.includes(day)), weekend: WEEK.filter((day) => weekend.includes(day)) }
  const [asking, setAsking] = useState<'set' | 'reset' | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string[]>([])
  const price = readPrice(text)
  const markup = markupText.trim() === '' || !weekendKnown ? 0 : readPrice(markupText)
  const all = nightsBetween(selection.first, selection.last)
  // The weekdays the picked nights hold; only those can be chosen.
  const present = WEEK.filter((day) => all.some((night) => weekday(night) === day))
  const nights = all.filter((night) => days.includes(weekday(night)))
  // A night's price is for stays by the night: an hourly flat sells by its tariffs.
  const priceable = rows.filter((row) => row.property.rental_mode !== 'hourly')
  const hourly = rows.filter((row) => row.property.rental_mode === 'hourly')
  const weekendPicked = nights.filter((night) => weekend.includes(weekday(night)))
  // The weekend price in whole tiyn (10000.10 + 1000.20 is 11000.30, not
  // 11000.300000000001), and checked before any write: a refused weekend price
  // after the weekdays' were saved would leave the nights half priced.
  const weekendPrice = price !== null && markup !== null ? Math.round((price + markup) * 100) / 100 : null
  const tooHigh = weekendPrice !== null && weekendPrice > MAX_PRICE
  // The nights by the price they get: the weekend ones may get more.
  const writes = price === null || markup === null || weekendPrice === null || tooHigh
    ? []
    : markup > 0
      ? [
          { price, runs: nightRuns(nights.filter((night) => !weekendPicked.includes(night))) },
          { price: weekendPrice, runs: nightRuns(weekendPicked) },
        ]
      : [{ price, runs: nightRuns(nights) }]
  const weekendNames = WEEK.filter((day) => weekend.includes(day)).map((day) => t(`gantt.weekdays.${day}`)).join(', ')
  const what = `${t('gantt.nightCount', { count: nights.length })}, ${priceable.map((row) => row.property.internal_name).join(', ')}`
  const sameSet = (set: readonly number[]) => present.every((day) => set.includes(day) === days.includes(day))

  async function run(kind: 'set' | 'reset') {
    setBusy(true)
    const missed = await eachFlat(priceable, async (row) => {
      if (kind === 'set') {
        for (const write of writes) {
          for (const range of write.runs) await setDayPrices(row.property.id, { ...range, price: write.price })
        }
      } else {
        for (const range of nightRuns(nights)) await clearDayPrices(row.property.id, range)
      }
    })
    setBusy(false)
    setAsking(null)
    // The chessboard shows the nights' prices, and the booking form counts them.
    queryClient.invalidateQueries({ queryKey: ['gantt-data'] })
    queryClient.invalidateQueries({ queryKey: ['price-calculation'] })
    if (missed.length === 0) {
      showToast('success', kind === 'set' ? t('gantt.priceSaved') : t('gantt.priceResetDone'))
      onDone()
    } else {
      setFailed(missed)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Picked selection={selection} flats={rows.length > 2 ? t('gantt.flatsCount', { count: rows.length }) : rows.map((row) => row.property.internal_name).join(', ')} />

      {priceable.length > 0 ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (writes.length > 0 && nights.length > 0) setAsking('set')
          }}
        >
          {/* Which nights of the range: all, the weekdays, or Friday and Saturday */}
          {present.length > 1 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-xs font-semibold text-ink">{t('gantt.daysLabel')}</legend>
              <div className="flex flex-wrap gap-1.5">
                {(weekendKnown ? (['all', 'work', 'weekend'] as const) : (['all'] as const)).map((set) => (
                  <button
                    key={set}
                    type="button"
                    aria-pressed={sameSet(DAY_SETS[set])}
                    onClick={() => setDays([...DAY_SETS[set]])}
                    className={`min-h-[32px] rounded-full border px-3 text-xs font-semibold transition-colors ${
                      sameSet(DAY_SETS[set]) ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink hover:bg-surface-page'
                    }`}
                  >
                    {t(`gantt.days.${set}`)}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {WEEK.map((day) => {
                  const on = days.includes(day)
                  const there = present.includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      disabled={!there}
                      aria-pressed={on && there}
                      onClick={() => setDays(on ? days.filter((other) => other !== day) : [...days, day])}
                      className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors disabled:opacity-30 ${
                        on && there ? 'bg-accent text-white' : `border border-line text-ink hover:bg-surface-page ${weekend.includes(day) ? 'bg-surface-page' : ''}`
                      }`}
                    >
                      {t(`gantt.weekdays.${day}`)}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-ink-muted">{t('gantt.daysPicked', { count: nights.length, total: all.length })}</p>
            </fieldset>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="night-price" className="text-xs font-semibold text-ink">{t('gantt.priceNew')}</label>
            <div className="relative">
              <input
                id="night-price"
                aria-invalid={text !== '' && price === null}
                aria-describedby={text !== '' && price === null ? 'night-price-error' : undefined}
                inputMode="decimal"
                autoFocus
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t('gantt.pricePlaceholder')}
                className="min-h-[44px] w-full rounded-xl border border-line bg-surface-card px-3 pr-8 text-base font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-muted/60 focus:border-accent"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">₸</span>
            </div>
            {text !== '' && price === null && <p id="night-price-error" className="text-xs text-danger">{t('gantt.priceInvalid')}</p>}
          </div>

          {weekendKnown && weekendPicked.length > 0 && weekendPicked.length < nights.length && (
            <div className="flex flex-col gap-2">
              <label htmlFor="weekend-markup" className="text-xs font-semibold text-ink">{t('gantt.markup')}</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-muted">+</span>
                <input
                  id="weekend-markup"
                  aria-invalid={markup === null}
                  aria-describedby={markup === null ? 'weekend-markup-error' : 'weekend-markup-hint'}
                  inputMode="decimal"
                  value={markupText}
                  onChange={(event) => setMarkupText(event.target.value)}
                  placeholder="0"
                  className="min-h-[44px] w-full rounded-xl border border-line bg-surface-card px-3 pl-7 pr-8 text-base font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-muted/60 focus:border-accent"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">₸</span>
              </div>
              {markup === null || tooHigh ? (
                <p id="weekend-markup-error" className="text-xs text-danger">{t('gantt.priceInvalid')}</p>
              ) : (
                <p id="weekend-markup-hint" className="text-xs text-ink-muted">{t('gantt.markupHint', { days: weekendNames })}</p>
              )}
            </div>
          )}

          {/* Each flat: what its picked nights cost now, and what they will */}
          <div>
            {priceable.map((row) => {
              const pricing = pricingByProperty[row.property.id]
              const priced = new Map((row.dayPrices ?? []).map((night) => [night.date, night.price]))
              const now = nights.map((night) => nightlyRate(pricing, night, priced.get(night), weekend)).filter((rate): rate is number => rate !== null)
              const low = Math.min(...now)
              const high = Math.max(...now)
              return (
                <div key={row.property.id} className={ROW}>
                  <span className="shrink-0 whitespace-nowrap font-bold text-ink">{row.property.internal_name}</span>
                  <span className="flex min-w-0 flex-col items-end gap-0.5 text-xs tabular-nums">
                    {now.length > 0 && (
                      <span className={price !== null ? 'text-ink-muted line-through' : 'text-ink'}>
                        {low === high ? money(low) : `${money(low)} – ${money(high)}`}
                      </span>
                    )}
                    {price !== null && (
                      <span className="flex flex-wrap items-center justify-end gap-x-1.5 font-bold text-accent-ink">
                        <ArrowRight className="h-3 w-3 text-ink-muted" aria-hidden="true" />
                        {money(price)}
                        {markup !== null && markup > 0 && weekendPicked.length > 0 && (
                          <span>· {t('gantt.weekendPrice', { price: money(weekendPrice ?? price) })}</span>
                        )}
                      </span>
                    )}
                  </span>
                </div>
              )
            })}
            {hourly.length > 0 && (
              <p className="pt-2 text-xs text-ink-muted">
                {hourly.map((row) => row.property.internal_name).join(', ')}: {t('gantt.priceHourlySkip')}
              </p>
            )}
          </div>

          <p className="text-xs text-ink-muted">{t('gantt.priceHint')}</p>
          <Button type="submit" disabled={writes.length === 0 || nights.length === 0 || busy}>{t('gantt.priceSet')}</Button>
          <button
            type="button"
            disabled={busy || nights.length === 0}
            onClick={() => setAsking('reset')}
            className="text-sm font-semibold text-accent-ink hover:underline disabled:opacity-50"
          >
            {t('gantt.priceReset')}
          </button>
        </form>
      ) : (
        <p className="text-sm text-ink-muted">{t('gantt.priceHourly')}</p>
      )}
      {failed.length > 0 && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
          {t('gantt.failedFor', { flats: failed.join(', ') })}
        </p>
      )}
      <ConfirmDialog
        open={asking !== null}
        title={asking === 'set' && price !== null ? t('gantt.priceAsk', { price: money(price) }) : t('gantt.priceResetAsk')}
        message={`${what}${asking === 'set' && weekendPrice !== null && markup ? `; ${t('gantt.weekendPrice', { price: money(weekendPrice) })}` : ''}. ${t('gantt.priceHint')}`}
        confirmLabel={asking === 'set' ? t('gantt.priceSet') : t('gantt.priceReset')}
        loading={busy}
        onCancel={() => setAsking(null)}
        onConfirm={() => asking && void run(asking)}
      />
    </div>
  )
}

const REASONS = ['repair', 'own', 'platform'] as const

function CloseNights({ rows, selection, onDone }: { rows: GanttRow[]; selection: ChessSelection; onDone: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const dates = useDates()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string[]>([])
  // Closed nights already in the pick open from here: no going back for another tool.
  const [opening, setOpening] = useState<{ row: GanttRow; block: GanttBlock } | null>(null)
  const checks = rows.map((row) => ({ row, ...busyOn(row, selection.first, selection.last) }))

  async function openNights() {
    if (!opening) return
    setBusy(true)
    try {
      await deleteBlock(opening.row.property.id, opening.block.id)
      queryClient.invalidateQueries({ queryKey: ['gantt-data'] })
      queryClient.invalidateQueries({ queryKey: ['property-blocks', opening.row.property.id] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      showToast('success', t('properties.blocks.removed'))
    } catch (error) {
      const fromCalendar = (error as { response?: { status?: number } })?.response?.status === 409
      showToast('error', fromCalendar ? t('gantt.blockFromPlatform') : t('properties.blocks.failed'))
    } finally {
      setBusy(false)
      setOpening(null)
    }
  }
  const closable = checks.filter((check) => check.bookings.length === 0 && check.blocks.length === 0).map((check) => check.row)

  async function run() {
    setBusy(true)
    const missed = await eachFlat(closable, (row) =>
      createBlock(row.property.id, { start_date: selection.first, end_date: addDays(selection.last, 1), reason: reason.trim() || undefined }),
    )
    setBusy(false)
    // The chessboard and the booking calendars show closed nights too.
    queryClient.invalidateQueries({ queryKey: ['gantt-data'] })
    queryClient.invalidateQueries({ queryKey: ['property-blocks'] })
    queryClient.invalidateQueries({ queryKey: ['bookings'] })
    if (missed.length === 0) {
      showToast('success', t('properties.blocks.added'))
      onDone()
    } else {
      setFailed(missed)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Picked selection={selection} flats={rows.length > 2 ? t('gantt.flatsCount', { count: rows.length }) : rows.map((row) => row.property.internal_name).join(', ')} />
      <div>
        {checks.map(({ row, bookings, blocks }) => (
          <div key={row.property.id} className={ROW}>
            <span className="font-bold text-ink">{row.property.internal_name}</span>
            <span className={`text-right text-xs ${bookings.length || blocks.length ? 'text-warning' : 'text-success'}`}>
              {bookings.length > 0
                ? t('gantt.closeSkipBooking', {
                    guest: bookings[0].guest_name,
                    dates: dates.range(barDays(bookings[0].check_in, bookings[0].check_out).start, addDays(barDays(bookings[0].check_in, bookings[0].check_out).end, -1)),
                  })
                : blocks.length > 0
                  ? (
                    <button
                      type="button"
                      onClick={() => setOpening({ row, block: blocks[0] })}
                      className="font-semibold text-accent-ink hover:underline"
                    >
                      {t('gantt.closeOpen', { reason: blocks[0].reason || t('gantt.closed'), dates: dates.range(blocks[0].start_date, addDays(blocks[0].end_date, -1)) })}
                    </button>
                  )
                  : t('gantt.closeWill')}
            </span>
          </div>
        ))}
      </div>
      {closable.length > 0 ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void run()
          }}
        >
          <label htmlFor="close-reason" className="text-xs font-semibold text-ink">{t('gantt.closeReason')}</label>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((key) => {
              const label = t(`gantt.reasons.${key}`)
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={reason === label}
                  onClick={() => setReason(label)}
                  className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold transition-colors ${
                    reason === label ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink hover:bg-surface-page'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <input
            id="close-reason"
            value={reason}
            maxLength={255}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('properties.blocks.reason')}
            className="min-h-[44px] rounded-xl border border-line bg-surface-card px-3 text-sm text-ink outline-none focus:border-accent"
          />
          <Button type="submit" disabled={busy}>{t('gantt.closeRun', { count: closable.length })}</Button>
        </form>
      ) : (
        <p className="text-sm text-ink-muted">{t('gantt.closeNothing')}</p>
      )}
      {failed.length > 0 && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
          {t('gantt.failedFor', { flats: failed.join(', ') })}
        </p>
      )}
      <ConfirmDialog
        open={opening !== null}
        title={t('properties.blocks.removeTitle')}
        message={opening ? `${opening.row.property.internal_name}, ${dates.range(opening.block.start_date, addDays(opening.block.end_date, -1))}` : ''}
        confirmLabel={t('properties.blocks.remove')}
        loading={busy}
        onCancel={() => setOpening(null)}
        onConfirm={() => void openNights()}
      />
    </div>
  )
}

/** Closed nights from the chessboard: why, and a way to open them. */
export function BlockPanel({ block, row, onClose }: { block: GanttBlock | null; row: GanttRow | null; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const dates = useDates()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)

  async function open() {
    if (!block || !row) return
    setBusy(true)
    try {
      await deleteBlock(row.property.id, block.id)
      queryClient.invalidateQueries({ queryKey: ['gantt-data'] })
      queryClient.invalidateQueries({ queryKey: ['property-blocks', row.property.id] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      showToast('success', t('properties.blocks.removed'))
      setAsking(false)
      onClose()
    } catch (error) {
      // A platform's calendar closed these nights: they open there.
      const fromCalendar = (error as { response?: { status?: number } })?.response?.status === 409
      showToast('error', fromCalendar ? t('gantt.blockFromPlatform') : t('properties.blocks.failed'))
      setAsking(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={block !== null} onClose={onClose} title={t('gantt.closed')}>
      {block && row && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-surface-page px-4 py-3">
            <p className="text-sm font-bold text-ink">{row.property.internal_name}</p>
            <p className="mt-0.5 text-sm text-ink">
              {dates.range(block.start_date, addDays(block.end_date, -1))}
              <span className="text-ink-muted"> · {t('gantt.nightCount', { count: nightsBetween(block.start_date, addDays(block.end_date, -1)).length })}</span>
            </p>
            {block.reason && <p className="mt-1 text-sm text-ink-muted">{block.reason}</p>}
          </div>
          {block.clash && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">{t('gantt.doubleSale')}</p>
          )}
          <Button variant="secondary" disabled={busy} onClick={() => setAsking(true)}>{t('properties.blocks.remove')}</Button>
          <ConfirmDialog
            open={asking}
            title={t('properties.blocks.removeTitle')}
            message={`${row.property.internal_name}, ${dates.range(block.start_date, addDays(block.end_date, -1))}`}
            confirmLabel={t('properties.blocks.remove')}
            loading={busy}
            onCancel={() => setAsking(false)}
            onConfirm={() => void open()}
          />
        </div>
      )}
    </Sheet>
  )
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

/** A day of a flat by the hour: its stays and the free hours between them, each free
 *  window a step from a booking at its start. */
export function HourlyDayPanel({
  open,
  onClose,
  onBookingOpen,
}: {
  open: { row: GanttRow; day: string } | null
  onClose: () => void
  onBookingOpen: (booking: Booking) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const dates = useDates()
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const nowKey = `${format(now, 'yyyy-MM-dd')}T${pad(now.getHours())}:${pad(now.getMinutes())}:00`

  const row = open?.row
  const day = open?.day ?? ''
  const stays = row ? hoursOn(row.bookings, day) : []
  const windows = row ? freeWindows(row.bookings, day, nowKey, row.blocks ?? []) : []
  // Stays by the night that arrive or leave this day, at their hour.
  const nights = (row?.bookings ?? [])
    .filter((booking) => booking.rental_mode !== 'hourly' && booking.status !== 'cancelled')
    .flatMap((booking) => {
      if (booking.check_in.slice(0, 10) === day) return [{ booking, arrives: true, at: booking.check_in.slice(11, 16) }]
      if (booking.check_out.slice(0, 10) === day) return [{ booking, arrives: false, at: booking.check_out.slice(11, 16) }]
      return []
    })
  const items = [
    ...stays.map((part) => ({ key: part.stay.id, from: part.from, stay: part })),
    ...nights.map((night) => ({ key: night.booking.id, from: minutes(night.at), night })),
    ...windows.map((window) => ({ key: `free:${window.from}`, from: minutes(window.from), window })),
  ].sort((a, b) => a.from - b.from)
  const paused = row?.property.status === 'paused'

  return (
    <Sheet open={open !== null} onClose={onClose} title={row?.property.internal_name ?? ''}>
      {row && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-surface-page px-4 py-3">
            <p className="text-sm font-bold text-ink">{dates.day(day)}</p>
            <p className="mt-0.5 text-sm text-ink-muted">{t('gantt.hourlyDay', { count: stays.length })}</p>
            {/* The day's 24 hours: what is taken, what is free */}
            <div className="relative mt-3 h-3 rounded-full bg-success-soft" aria-hidden="true">
              {/* A stay by the night: from its check-in to midnight, or from midnight to its check-out */}
              {nights.map((night) => {
                const at = minutes(night.at)
                const [from, to] = night.arrives ? [at, 1440] : [0, at]
                return (
                  <span
                    key={night.booking.id}
                    className="absolute inset-y-0 rounded-full bg-accent/35"
                    style={{ left: `${(from / 1440) * 100}%`, width: `${((to - from) / 1440) * 100}%` }}
                  />
                )
              })}
              {stays.map((part) => (
                <span
                  key={part.stay.id}
                  className="absolute inset-y-0 rounded-full bg-accent"
                  style={{ left: `${(part.from / 1440) * 100}%`, width: `${((part.to - part.from) / 1440) * 100}%` }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-ink-muted tabular-nums" aria-hidden="true">
              {['00', '06', '12', '18', '24'].map((hour) => <span key={hour}>{hour}</span>)}
            </div>
          </div>

          <ul className="flex flex-col gap-2">
            {items.map((item) =>
              'stay' in item && item.stay ? (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      onBookingOpen(item.stay.stay)
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-card px-3 py-2.5 text-left transition-colors hover:bg-surface-page"
                  >
                    <Clock className="h-4 w-4 shrink-0 text-ink-muted" aria-label={t('properties.form.rentalModeHourly')} />
                    <span className="w-24 shrink-0 text-sm font-bold text-ink tabular-nums">
                      {clock(item.stay.from)}–{clock(item.stay.to)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {item.stay.stay.overbooking && (
                        <span className="mr-1.5 rounded bg-red-600 px-1 text-[10px] font-bold text-white">{t('bookings.overbooking.short')}</span>
                      )}
                      {item.stay.stay.guest_name}
                    </span>
                    <BookingStatusBadge status={item.stay.stay.status} />
                  </button>
                </li>
              ) : 'night' in item && item.night ? (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      onBookingOpen(item.night.booking)
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-card px-3 py-2.5 text-left transition-colors hover:bg-surface-page"
                  >
                    <Moon className="h-4 w-4 shrink-0 text-ink-muted" aria-label={t('properties.form.rentalModeDaily')} />
                    <span className="flex w-24 shrink-0 flex-col">
                      <span className="text-xs text-ink-muted">{t(item.night.arrives ? 'properties.checkIn' : 'properties.checkOut')}</span>
                      <span className="text-sm font-bold text-ink tabular-nums">{item.night.at}</span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm text-ink">{item.night.booking.guest_name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                        {t('gantt.nightCount', { count: nightsBetween(item.night.booking.check_in.slice(0, 10), addDays(item.night.booking.check_out.slice(0, 10), -1)).length })}
                        <BookingStatusBadge status={item.night.booking.status} />
                      </span>
                    </span>
                  </button>
                </li>
              ) : 'window' in item && item.window ? (
                <li key={item.key} className="flex items-center gap-3 rounded-xl border border-dashed border-success/60 bg-success-soft/40 px-3 py-2">
                  <span className="w-4 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-success tabular-nums">{item.window.from}–{item.window.to}</p>
                    <p className="text-xs text-ink-muted">{t('gantt.freeHours', { count: item.window.hours })}</p>
                  </div>
                  {/* Any free hour can be sold: a short stay is priced by the tariffs' rounding up. */}
                  <button
                    type="button"
                    disabled={paused}
                    className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
                    onClick={() =>
                      navigate({
                        to: '/bookings/new',
                        search: { property_id: row.property.id, from: 'gantt', check_in: `${day}T${item.window.from}` } as Record<string, string>,
                      })
                    }
                  >
                    {t('gantt.book')}
                  </button>
                </li>
              ) : null,
            )}
          </ul>
          {windows.length === 0 && <p className="text-sm text-ink-muted">{t('gantt.noFreeHours')}</p>}
        </div>
      )}
    </Sheet>
  )
}

/** A booking from the chessboard: the stay, the money, and its next step, without leaving the grid. */
export function BookingPanel({
  booking,
  onClose,
  onMove,
  onBack,
}: {
  booking: Booking | null
  onClose: () => void
  onMove: (booking: Booking) => void
  /** Opened from a day's panel: back to that day. */
  onBack?: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet open={booking !== null} onClose={onClose} title={booking?.guest_name ?? ''} onBack={onBack}>
      {booking && <BookingPanelBody bookingId={booking.id} fallback={booking} />}
      {booking && booking.status !== 'cancelled' && booking.status !== 'completed' && (
        <button
          type="button"
          onClick={() => {
            onClose()
            onMove(booking)
          }}
          className="text-left text-sm font-semibold text-accent-ink hover:underline"
        >
          {t('gantt.moveTo')}
        </button>
      )}
      {booking && (
        <Link
          to="/bookings/$bookingId"
          params={{ bookingId: booking.id }}
          search={{ from: 'gantt' } as Record<string, string>}
          className="text-sm font-semibold text-accent-ink hover:underline"
        >
          {t('gantt.openBooking')}
        </Link>
      )}
    </Sheet>
  )
}

function BookingPanelBody({ bookingId, fallback }: { bookingId: string; fallback: Booking }) {
  const { t } = useTranslation()
  const money = useMoney()
  const { data: detail } = useBooking(bookingId)
  const [paying, setPaying] = useState(false)
  const booking = detail?.booking ?? fallback
  const sums = detail ? bookingMoney(booking.status, Number(booking.total_price), detail.payments) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <BookingStatusBadge status={booking.status} />
        <span>{booking.property_internal_name || booking.property_name}</span>
        <span aria-hidden="true">·</span>
        <span>{t(`bookings.sources.${booking.source}`)}</span>
      </div>
      {/* Changed only once the full booking is in: the grid's copy lacks the price Day worked out,
          and without it more guests would reprice the stay with no question. */}
      <BookingBlocks booking={booking} editable={detail !== undefined} />
      {sums && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-line px-2 py-2">
            <p className="text-[11px] text-ink-muted">{t('gantt.moneyTotal')}</p>
            <p className="text-sm font-bold text-ink">{money(sums.total)}</p>
          </div>
          <div className="rounded-xl border border-line px-2 py-2">
            <p className="text-[11px] text-ink-muted">{t('gantt.moneyPaid')}</p>
            <p className="text-sm font-bold text-ink">{money(sums.paid)}</p>
          </div>
          <div className={`rounded-xl px-2 py-2 ${sums.owes > 0 ? 'bg-danger-soft' : 'border border-line'}`}>
            <p className={`text-[11px] ${sums.owes > 0 ? 'text-danger' : 'text-ink-muted'}`}>{t('gantt.moneyOwes')}</p>
            <p className={`text-sm font-bold ${sums.owes > 0 ? 'text-danger' : 'text-ink'}`}>{money(sums.owes)}</p>
          </div>
        </div>
      )}
      {detail && sums && sums.owes > 0 && mainStep(booking.status, sums.owes, detail.deposits) !== 'takePayment' && (
        <Button variant="secondary" onClick={() => setPaying(true)}>{t('today.takePayment')}</Button>
      )}
      {detail && sums && (
        <BookingActions booking={{ ...booking, paid_amount: sums.paid }} money={sums} deposits={detail.deposits} />
      )}
      {detail && sums && (
        <TakePaymentPanel
          booking={{ ...booking, paid_amount: sums.paid }}
          stayDebt={sums.owes}
          ordersDue={booking.orders_due ?? 0}
          open={paying}
          onClose={() => setPaying(false)}
        />
      )}
    </div>
  )
}
