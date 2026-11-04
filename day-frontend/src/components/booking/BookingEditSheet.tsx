import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { calculatePrice } from '../../api/bookings'
import { getAvailability } from '../../api/miniapp'
import { useBookedNights, useUpdateBooking } from '../../hooks/useBookings'
import { useCurrency } from '../../hooks/useCurrency'
import { useAllProperties, useProperty, usePropertyPricing } from '../../hooks/useProperties'
import { nightsWindow, switchRentalMode, wouldReprice } from '../../lib/booking-dates'
import { datesForm, datesPatch, flatHours, hourlyStay, type DatesError, type DatesForm, type EditBlock } from '../../lib/booking-edit'
import {
  currentBreaches,
  getBookingApiErrorMessage,
  stayRuleBreaches,
  type RulesRefusal,
} from '../../lib/booking-errors'
import type { Booking, BookingSource, BookingUpdateInput, RentalMode } from '../../types/booking'
import AgentSelect from '../agents/AgentSelect'
import Button from '../ui/Button'
import DatePicker from '../ui/date-picker'
import DateRangePicker from '../ui/date-range-picker'
import NumberInput from '../ui/number-input'
import { Sheet } from '../ui/sheet'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import TimeChips, { CHECK_IN_TIMES, CHECK_OUT_TIMES } from '../ui/time-chips'
import { showToast } from '../ui/Toast'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import HourlyTimes from './HourlyTimes'
import StayRulesAlert from './StayRulesAlert'

const TITLES: Record<EditBlock, string> = {
  dates: 'bookings.editBlock.dates',
  guests: 'bookings.editBlock.guests',
  source: 'bookings.editBlock.source',
  notes: 'bookings.editBlock.notes',
}
const LABEL = 'mb-1.5 block text-xs font-bold text-ink-muted'
const FIELD_ERROR = 'mt-1 text-xs text-danger'

/** One block of a booking edited in a panel from the right; the screen below stays. */
export default function BookingEditSheet({
  booking,
  block,
  onClose,
  onBack,
}: {
  booking: Booking
  block: EditBlock | null
  onClose: () => void
  /** Opened from another panel: back to it. */
  onBack?: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet open={block !== null} onClose={onClose} title={block ? t(TITLES[block]) : ''} onBack={onBack}>
      {/* Keyed by booking and block, not by its last change: a refetch while typing keeps the text. */}
      {block && <BlockForm key={`${block}-${booking.id}`} booking={booking} block={block} onDone={onBack ?? onClose} />}
    </Sheet>
  )
}

function BlockForm({ booking, block, onDone }: { booking: Booking; block: EditBlock; onDone: () => void }) {
  const { t } = useTranslation()
  const { format: money } = useCurrency()
  const update = useUpdateBooking(booking.id)
  const [quoting, setQuoting] = useState(false)
  const [failed, setFailed] = useState('')
  // The save the stay rules refused; "save anyway" sends exactly it again.
  const [refused, setRefused] = useState<RulesRefusal<BookingUpdateInput> | null>(null)
  // New dates or guests of a stay Day priced itself change its price: the operator chooses.
  const [priceChoice, setPriceChoice] = useState<{ patch: BookingUpdateInput; was: number; now: number } | null>(null)
  // What the form would send: {} while nothing changed, null while it is not valid.
  const [patch, setPatch] = useState<BookingUpdateInput | null>({})
  // A press on "Save" with a wrong form shows what is wrong.
  const [tried, setTried] = useState(false)

  function send(body: BookingUpdateInput) {
    setFailed('')
    update.mutate(body, {
      onSuccess: () => {
        showToast('success', t('bookings.bookingUpdated'))
        onDone()
      },
      onError: (err) => {
        const broken = stayRuleBreaches(err)
        setRefused(broken ? { payload: body, breaches: broken } : null)
        if (!broken) setFailed(getBookingApiErrorMessage(err, t) || t('bookings.failedUpdate'))
      },
    })
  }

  async function save(next: BookingUpdateInput) {
    setPriceChoice(null)
    if (Object.keys(next).length === 0) {
      onDone()
      return
    }
    if (wouldReprice(booking, next)) {
      setQuoting(true)
      try {
        const quote = await calculatePrice({
          property_id: next.property_id ?? booking.property_id,
          check_in: next.check_in ?? booking.check_in,
          check_out: next.check_out ?? booking.check_out,
          adults_count: next.adults_count ?? booking.adults_count,
          children_count: next.children_count ?? booking.children_count,
          rental_mode: next.rental_mode ?? booking.rental_mode,
        })
        if (Number(quote.total) !== Number(booking.total_price)) {
          setPriceChoice({ patch: next, was: Number(booking.total_price), now: Number(quote.total) })
          return
        }
      } catch {
        // No quote is no reason to stop the save; the server prices it as before.
      } finally {
        setQuoting(false)
      }
    }
    send(next)
  }

  // The form reports what it would send on every change, so a refusal or a price
  // question about an older version of it goes away.
  function changed(next: BookingUpdateInput | null) {
    setPatch(next)
    setPriceChoice(null)
    setFailed('')
  }

  const breaches = patch ? currentBreaches(refused, patch) : null
  const busy = update.isPending || quoting

  return (
    <div className="flex flex-col gap-5">
      {block === 'dates' && <DatesFields booking={booking} showErrors={tried} onChange={changed} />}
      {block === 'guests' && <GuestsFields booking={booking} onChange={changed} />}
      {block === 'source' && <SourceFields booking={booking} onChange={changed} />}
      {block === 'notes' && <NotesFields booking={booking} onChange={changed} />}

      {breaches && refused && (
        <StayRulesAlert
          breaches={breaches}
          action={t('bookings.stayRules.saveAnyway')}
          busy={update.isPending}
          onOverride={() => send({ ...refused.payload, override_rules: true })}
        />
      )}
      {priceChoice && (
        <div role="alert" className="space-y-3 rounded-xl bg-warning-soft p-4">
          <p className="text-sm text-ink">
            {t('bookings.priceChoice.ask', { now: money(priceChoice.now), was: money(priceChoice.was) })}
          </p>
          <div className="flex flex-col gap-2">
            <Button disabled={update.isPending} onClick={() => send(priceChoice.patch)}>
              {t('bookings.priceChoice.reprice', { now: money(priceChoice.now) })}
            </Button>
            <Button
              variant="secondary"
              disabled={update.isPending}
              onClick={() => send({ ...priceChoice.patch, total_price: priceChoice.was })}
            >
              {t('bookings.priceChoice.keep', { was: money(priceChoice.was) })}
            </Button>
          </div>
        </div>
      )}
      {failed && (
        <p role="alert" className="text-sm font-semibold text-danger">
          {failed}
        </p>
      )}
      {!priceChoice && (
        <Button
          disabled={busy || (patch !== null && Object.keys(patch).length === 0)}
          onClick={() => (patch ? save(patch) : setTried(true))}
        >
          {t('common.save')}
        </Button>
      )}
    </div>
  )
}

/** Dates and, for a daily stay, the times: 14:00 and 12:00 unless the guest agreed on others. */
function DatesFields({
  booking,
  showErrors,
  onChange,
}: {
  booking: Booking
  showErrors: boolean
  onChange: (patch: BookingUpdateInput | null) => void
}) {
  const { t } = useTranslation()
  const { data: flat } = useProperty(booking.property_id)
  const [form, setForm] = useState<DatesForm>(() => datesForm(booking, flat))
  // Other stays of the flat, struck through in the calendar; this booking's own nights stay open.
  const [month, setMonth] = useState(() => new Date(booking.check_in.slice(0, 10)))
  const nights = nightsWindow(month, form.check_in && !form.check_out ? form.check_in : null)
  // The nights taken in the flat the stay is going to, picked below.
  const booked = useBookedNights(form.property_id, nights.from, nights.to, booking.id, booking.source)
  const hourly = form.rental_mode === 'hourly'
  const { data: allFlats } = useAllProperties()
  const flatName = (f: { name: string; internal_name: string }) => f.internal_name || f.name
  // By name, numbers as numbers: Кв. 12, Кв. 15, Кв. 28. The list API carries no company order.
  const flats = (allFlats?.items ?? [])
    .filter((f) => f.id === booking.property_id || (f.status === 'active' && (f.rental_mode === 'both' || f.rental_mode === form.rental_mode)))
    .sort((a, b) => flatName(a).localeCompare(flatName(b), undefined, { numeric: true }))
  // The stay as the form has it now: which other flats are free for it.
  const hours = hourly && form.hourly_date && form.start_time && form.end_time ? hourlyStay(form.hourly_date, form.start_time, form.end_time) : null
  const stayFrom = hourly ? (hours?.checkIn ?? '') : form.check_in ? `${form.check_in}T${form.in_time}:00` : ''
  const stayTo = hourly ? (hours?.checkOut ?? '') : form.check_out ? `${form.check_out}T${form.out_time}:00` : ''
  // The tariffs of the flat the stay is going to: they are the lengths offered.
  const { data: targetPricing } = usePropertyPricing(form.property_id)
  const { data: free } = useQuery({
    // Under 'bookings': every booking change invalidates it, so a flat freed by a move shows free.
    queryKey: ['bookings', 'move-free', stayFrom, stayTo, form.rental_mode, booking.adults_count],
    queryFn: () =>
      getAvailability(stayFrom, stayTo, { adults: booking.adults_count, rentalMode: form.rental_mode, withRuleBreaches: true }),
    enabled: stayFrom !== '' && stayTo !== '' && stayFrom < stayTo,
  })
  // A hint, not a lock: availability checks the whole stay, while a guest moved mid-stay
  // needs the flat only from today. The server decides on save.
  const busy = (id: string) => id !== booking.property_id && free !== undefined && !free.items.some((item) => item.property_id === id)

  const result = datesPatch(booking, form)
  const errors: DatesError = showErrors && 'errors' in result ? result.errors : {}

  function set(next: DatesForm) {
    setForm(next)
    const checked = datesPatch(booking, next)
    onChange('patch' in checked ? checked.patch : null)
  }

  const error = (key: keyof DatesError) => errors[key] && <p className={FIELD_ERROR}>{t(errors[key])}</p>

  return (
    <>
      <div>
        <span id="edit-flat-label" className={LABEL}>{t('bookings.flat')}</span>
        <Select value={form.property_id} onValueChange={(value) => set({ ...form, property_id: value })}>
          <SelectTrigger id="edit-flat" aria-labelledby="edit-flat-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {flats.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {flatName(f)}
                {busy(f.id) ? ` · ${t('bookings.flatBusy')}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {flat?.rental_mode === 'both' && (
        <div>
          <span id="edit-mode-label" className={LABEL}>{t('bookings.rentalMode.label')}</span>
          <ToggleGroup
            aria-labelledby="edit-mode-label"
            type="single"
            value={form.rental_mode}
            onValueChange={(value) => {
              if (!value) return
              const next = switchRentalMode(form, value as RentalMode)
              // From hours to nights: the flat's hours, read now that the flat is loaded.
              set(value === 'daily' && booking.rental_mode === 'hourly' ? { ...next, ...flatHours(flat) } : next)
            }}
          >
            <ToggleGroupItem value="daily">{t('bookings.rentalMode.daily')}</ToggleGroupItem>
            <ToggleGroupItem value="hourly">{t('bookings.rentalMode.hourly')}</ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}
      {hourly ? (
        <>
          <div>
            <label htmlFor="edit-hourly-date" className={LABEL}>{t('bookings.date')}</label>
            <DatePicker
              id="edit-hourly-date"
              value={form.hourly_date}
              onChange={(value) => set({ ...form, hourly_date: value })}
              placeholder={t('bookings.selectDates')}
            />
            {error('check_in')}
          </div>
          <HourlyTimes
            idPrefix="edit-hours"
            start={form.start_time}
            end={form.end_time}
            pricing={targetPricing}
            onChange={({ start, end }) => set({ ...form, start_time: start, end_time: end })}
            errors={{
              start: errors.start_time && t(errors.start_time),
              end: errors.end_time && t(errors.end_time),
            }}
          />
        </>
      ) : (
        <>
          <div>
            {/* The panel's title already says "Dates". */}
            <label htmlFor="edit-date-range" className="sr-only">{t('bookings.dateRange')}</label>
            <DateRangePicker
              id="edit-date-range"
              startDate={form.check_in}
              endDate={form.check_out}
              months={1}
              onRangeChange={(start, end) => set({ ...form, check_in: start, check_out: end })}
              placeholder={t('bookings.selectDates')}
              error={!!errors.check_in || !!errors.check_out}
              booked={booked.data}
              bookedLoading={booked.isLoading}
              bookedFailed={booked.isError}
              onBookedRetry={() => booked.refetch()}
              onMonthChange={setMonth}
            />
            {error('check_in')}
            {error('check_out')}
          </div>
          <div>
            <span id="edit-in-time-label" className={LABEL}>{t('bookings.checkInTime')}</span>
            <TimeChips
              id="edit-in-time"
              labelledBy="edit-in-time-label"
              options={CHECK_IN_TIMES}
              value={form.in_time}
              onChange={(value) => set({ ...form, in_time: value })}
            />
            {error('in_time')}
          </div>
          <div>
            <span id="edit-out-time-label" className={LABEL}>{t('bookings.checkOutTime')}</span>
            <TimeChips
              id="edit-out-time"
              labelledBy="edit-out-time-label"
              options={CHECK_OUT_TIMES}
              value={form.out_time}
              onChange={(value) => set({ ...form, out_time: value })}
            />
            {error('out_time')}
          </div>
        </>
      )}
    </>
  )
}

function GuestsFields({ booking, onChange }: { booking: Booking; onChange: (patch: BookingUpdateInput | null) => void }) {
  const { t } = useTranslation()
  const [adults, setAdults] = useState(booking.adults_count)
  const [children, setChildren] = useState(booking.children_count)

  function report(nextAdults: number, nextChildren: number) {
    const patch: BookingUpdateInput = {}
    if (nextAdults !== booking.adults_count) patch.adults_count = nextAdults
    if (nextChildren !== booking.children_count) patch.children_count = nextChildren
    onChange(patch)
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label htmlFor="edit-adults" className={LABEL}>{t('bookings.adults')}</label>
        <NumberInput
          id="edit-adults"
          value={adults}
          min={1}
          onChange={(value) => {
            const next = Math.max(1, parseInt(value) || 1)
            setAdults(next)
            report(next, children)
          }}
        />
      </div>
      <div>
        <label htmlFor="edit-children" className={LABEL}>{t('bookings.children')}</label>
        <NumberInput
          id="edit-children"
          value={children}
          min={0}
          onChange={(value) => {
            const next = Math.max(0, parseInt(value) || 0)
            setChildren(next)
            report(adults, next)
          }}
        />
      </div>
    </div>
  )
}

const SOURCES: BookingSource[] = ['direct', 'booking', 'airbnb', 'other', 'crm', 'offer', 'site']

function SourceFields({ booking, onChange }: { booking: Booking; onChange: (patch: BookingUpdateInput | null) => void }) {
  const { t } = useTranslation()
  const [source, setSource] = useState(booking.source)
  // '' when the guest came on their own.
  const [agent, setAgent] = useState(booking.agent_id ?? '')

  function report(nextSource: BookingSource, nextAgent: string) {
    const patch: BookingUpdateInput = {}
    if (nextSource !== booking.source) patch.source = nextSource
    if (nextAgent !== (booking.agent_id ?? '')) patch.agent_id = nextAgent || null
    onChange(patch)
  }

  return (
    <>
      <div>
        <span id="edit-source-label" className={LABEL}>{t('bookings.source')}</span>
        <ToggleGroup
          aria-labelledby="edit-source-label"
          type="single"
          className="flex-wrap"
          value={source}
          onValueChange={(value) => {
            if (!value) return
            setSource(value as BookingSource)
            report(value as BookingSource, agent)
          }}
        >
          {SOURCES.map((value) => (
            <ToggleGroupItem key={value} value={value}>
              {t(`bookings.sources.${value}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div>
        <label htmlFor="edit-agent" className={LABEL}>{t('bookings.agent')}</label>
        <AgentSelect
          id="edit-agent"
          value={agent}
          onChange={(next) => {
            setAgent(next)
            report(source, next)
          }}
          className="w-full rounded-xl border border-line bg-surface-page p-3 text-sm outline-none"
        />
      </div>
    </>
  )
}

function NotesFields({ booking, onChange }: { booking: Booking; onChange: (patch: BookingUpdateInput | null) => void }) {
  const { t } = useTranslation()
  const [notes, setNotes] = useState(booking.notes ?? '')
  return (
    <div>
      <label htmlFor="edit-notes" className="sr-only">{t('common.notes')}</label>
      <textarea
        id="edit-notes"
        value={notes}
        autoFocus
        onChange={(e) => {
          setNotes(e.target.value)
          onChange(e.target.value.trim() === (booking.notes ?? '').trim() ? {} : { notes: e.target.value.trim() })
        }}
        placeholder={t('common.optionalNotes')}
        rows={6}
        className="w-full resize-none rounded-xl border border-line bg-surface-page p-3 text-sm outline-none"
      />
    </div>
  )
}
