import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Building2, Check, Loader2 } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useBookedNights, useCreateBooking, useCalculatePrice, useGuests } from '../../hooks/useBookings'
import { useAllProperties, usePropertyPricing } from '../../hooks/useProperties'
import type { BookingSource, BookingCreateInput, PriceCalculateInput, RentalMode } from '../../types/booking'
import type { Guest } from '../../types/booking'
import DateRangePicker from '../../components/ui/date-range-picker'
import DatePicker from '../../components/ui/date-picker'
import TimeChips, { CHECK_IN_TIMES, CHECK_OUT_TIMES } from '../../components/ui/time-chips'
import { hourlyStay, isStayTime } from '../../lib/booking-edit'
import HourlyTimes from '../../components/booking/HourlyTimes'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import NumberInput from '../../components/ui/number-input'
import Button from '../../components/ui/Button'
import AgentSelect from '../../components/agents/AgentSelect'
import { useCurrency } from '../../hooks/useCurrency'
import { getAvailability } from '../../api/miniapp'
import { formatMoneyExact as formatMoney } from '../miniapp/format'
import {
  currentBreaches,
  getBookingApiErrorMessage,
  getBookingFieldError,
  stayRuleBreaches,
  type RulesRefusal,
} from '../../lib/booking-errors'
import StayRulesAlert from '../../components/booking/StayRulesAlert'
import { nightsWindow, switchRentalMode } from '../../lib/booking-dates'

const LABEL = 'mb-1.5 block text-xs font-bold text-ink-muted'
const FIELD =
  'w-full rounded-xl border bg-surface-page p-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent'
const FIELD_ERROR = 'mt-1 text-xs text-danger'
const edge = (error?: string) => (error ? 'border-danger' : 'border-line')

interface FormData {
  property_id: string
  check_in: string
  check_out: string
  /** Daily stays: HH:mm, '' for the flat's own hours. */
  in_time: string
  out_time: string
  rental_mode: RentalMode
  hourly_date: string
  start_time: string
  end_time: string
  guest_name: string
  guest_phone: string
  guest_email: string
  source: BookingSource
  adults_count: number
  children_count: number
  notes: string
  /** '' when the guest came on their own. */
  agent_id: string
}

const initialForm: FormData = {
  property_id: '',
  check_in: '',
  check_out: '',
  in_time: '',
  out_time: '',
  rental_mode: 'daily',
  hourly_date: '',
  start_time: '',
  end_time: '',
  guest_name: '',
  guest_phone: '',
  guest_email: '',
  source: 'direct',
  adults_count: 1,
  children_count: 0,
  notes: '',
  agent_id: '',
}

// Split an ISO date-time (or bare date) into its date and HH:mm components.
function splitDateTime(value: string): { date: string; time: string } {
  const [date, rest] = value.split('T')
  return { date: date || '', time: rest ? rest.slice(0, 5) : '' }
}

interface BookingPrefill {
  propertyId: string
  checkIn: string
  checkOut: string
  from: string
}

function isDateOnly(value: string): boolean {
  // Accepts a bare date or an ISO date-time (optional clock component) so that a
  // gantt hourly cell click can prefill a specific time.
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(value)
}

function getBookingPrefill(): BookingPrefill {
  if (typeof window === 'undefined') {
    return { propertyId: '', checkIn: '', checkOut: '', from: '' }
  }

  const params = new URLSearchParams(window.location.search)
  const propertyId = params.get('property_id') || ''
  const checkInRaw = params.get('check_in') || ''
  const checkOutRaw = params.get('check_out') || ''
  const from = params.get('from') || ''

  const checkIn = isDateOnly(checkInRaw) ? checkInRaw : ''
  const checkOut = isDateOnly(checkOutRaw) ? checkOutRaw : ''

  // Accept only a valid forward range to avoid broken prefilled states.
  return {
    propertyId,
    checkIn,
    checkOut: checkIn && checkOut && checkIn < checkOut ? checkOut : '',
    from,
  }
}

export default function CreateBookingPage() {
  const { t, i18n } = useTranslation()
  const { symbol } = useCurrency()
  const sum = (value: number) => `${formatMoney(value, i18n.language)} ${symbol}`
  const prefill = useMemo(() => getBookingPrefill(), [])
  const navigate = useNavigate()
  const createBooking = useCreateBooking()
  const [form, setForm] = useState<FormData>(() => {
    // A prefilled clock component (from a gantt hourly cell) seeds the hourly UI.
    const prefillHasTime = prefill.checkIn.includes('T')
    const ci = splitDateTime(prefill.checkIn)
    const co = splitDateTime(prefill.checkOut)
    return {
      ...initialForm,
      property_id: prefill.propertyId,
      check_in: prefillHasTime ? '' : prefill.checkIn,
      check_out: prefillHasTime ? '' : prefill.checkOut,
      rental_mode: prefillHasTime ? 'hourly' : 'daily',
      hourly_date: prefillHasTime ? ci.date : '',
      start_time: prefillHasTime ? ci.time : '',
      end_time: prefillHasTime ? co.time : '',
    }
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  // The backend matches a guest by name OR phone, so the lookup follows
  // whichever of the two fields the operator is typing into.
  const [guestQueryField, setGuestQueryField] = useState<'phone' | 'name'>('phone')
  const guestSearch = (guestQueryField === 'name' ? form.guest_name : form.guest_phone).trim()
  const canSearchGuests = guestSearch.length >= 2
  const [showGuestSuggestions, setShowGuestSuggestions] = useState(false)

  const SOURCES: { value: BookingSource; label: string }[] = [
    { value: 'direct', label: t('bookings.sources.direct') },
    { value: 'booking', label: t('bookings.sources.booking') },
    { value: 'airbnb', label: t('bookings.sources.airbnb') },
    { value: 'other', label: t('bookings.sources.other') },
  ]

  const { data: propertiesData } = useAllProperties()
  const properties = useMemo(
    () => (propertiesData?.items ?? []).filter((property) => property.status === 'active' || property.status === 'paused'),
    [propertiesData?.items],
  )
  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === form.property_id),
    [properties, form.property_id],
  )

  // The property constrains the booking mode: hourly-only forces hourly,
  // daily-only forces daily, and `both` honours whatever the operator picked.
  // Derived during render so switching properties needs no state sync.
  const rentalMode: RentalMode =
    selectedProperty?.rental_mode === 'hourly'
      ? 'hourly'
      : selectedProperty?.rental_mode === 'both'
        ? form.rental_mode
        : selectedProperty
          ? 'daily'
          : form.rental_mode

  const isHourly = rentalMode === 'hourly'
  // The flat's tariffs: the lengths offered for an hourly stay.
  const { data: pricing } = usePropertyPricing(form.property_id)
  // A daily stay starts with the flat's hours, else 14:00 / 12:00, until the operator picks others.
  const hourOf = (value: number) => `${String(value).padStart(2, '0')}:00`
  const inTime = form.in_time || hourOf(selectedProperty?.check_in_hour ?? 14)
  const outTime = form.out_time || hourOf(selectedProperty?.check_out_hour ?? 12)
  // For hourly the check-in/out are assembled from a single day + start/end time;
  // for daily from the picked dates and the times above.
  // An hourly end at or before the start is the next day (a night, hours past midnight).
  const hours = form.hourly_date && form.start_time && form.end_time ? hourlyStay(form.hourly_date, form.start_time, form.end_time) : null
  const effectiveCheckIn = isHourly
    ? (hours?.checkIn ?? '')
    : form.check_in
      ? `${form.check_in}T${inTime}:00`
      : ''
  const effectiveCheckOut = isHourly
    ? (hours?.checkOut ?? '')
    : form.check_out
      ? `${form.check_out}T${outTime}:00`
      : ''

  // The calendar's first month on screen: its booked nights are shown struck through.
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const nights = nightsWindow(calendarMonth, form.check_in && !form.check_out ? form.check_in : null)
  const booked = useBookedNights(form.property_id, nights.from, nights.to, undefined, form.source)

  const { data: guestsData } = useGuests(
    { search: guestSearch, limit: 5 },
    canSearchGuests,
  )
  const guestSuggestions = canSearchGuests ? (guestsData?.items ?? []) : []

  // Debounced price calculation params
  const [debouncedPriceParams, setDebouncedPriceParams] = useState<PriceCalculateInput | null>(null)

  const priceParams = useMemo<PriceCalculateInput | null>(() => {
    if (!form.property_id || !effectiveCheckIn || !effectiveCheckOut) return null
    return {
      property_id: form.property_id,
      check_in: effectiveCheckIn,
      check_out: effectiveCheckOut,
      adults_count: form.adults_count,
      children_count: form.children_count,
      rental_mode: rentalMode,
    }
  }, [form.property_id, effectiveCheckIn, effectiveCheckOut, form.adults_count, form.children_count, rentalMode])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPriceParams(priceParams)
    }, 300)
    return () => clearTimeout(timer)
  }, [priceParams])

  const { data: priceData, isFetching: priceLoading } = useCalculatePrice(debouncedPriceParams)

  // The dates first, then the objects free then, each with its price, to pick one from
  // (the owner's choice, 18 Nov): a call is "is anything free on the 24th?".
  const free = useQuery({
    queryKey: ['bookings', 'availability', rentalMode, effectiveCheckIn, effectiveCheckOut, form.adults_count],
    queryFn: () =>
      getAvailability(effectiveCheckIn, effectiveCheckOut, {
        adults: form.adults_count,
        rentalMode,
        withRuleBreaches: true,
      }),
    enabled: !!effectiveCheckIn && !!effectiveCheckOut,
  })
  // The object asked for (from the chessboard or its page) that is taken on the dates picked.
  const taken = !!free.data && !!selectedProperty && !free.data.items.some((item) => item.property_id === form.property_id)

  // The request the stay rules refused; "book anyway" sends exactly it again.
  const [refused, setRefused] = useState<RulesRefusal<BookingCreateInput> | null>(null)

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => {
      const next = { ...e }
      delete next[key]
      return next
    })
  }

  // The picked date moves to the other mode's field instead of disappearing.
  function switchMode(mode: RentalMode) {
    // An object let only the other way is no longer the choice: the free ones are listed anew.
    const fits = !selectedProperty || selectedProperty.rental_mode === 'both' || selectedProperty.rental_mode === mode
    setForm((f) => ({ ...switchRentalMode(f, mode), ...(fits ? {} : { property_id: '' }) }))
    setErrors((e) => {
      const next = { ...e }
      delete next.rental_mode
      delete next.check_in
      delete next.check_out
      return next
    })
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!form.property_id || taken) errs.property_id = t('bookings.validation.propertyRequired')
    else if (!selectedProperty) errs.property_id = t('bookings.validation.propertyUnavailable')
    else if (selectedProperty.status === 'paused') errs.property_id = t('bookings.validation.pausedProperty')
    if (isHourly) {
      if (!form.hourly_date) errs.check_in = t('bookings.validation.dateRequired')
      if (!form.start_time) errs.start_time = t('bookings.validation.startTimeRequired')
      if (!form.end_time) errs.end_time = t('bookings.validation.endTimeRequired')
      if (form.start_time && form.end_time && form.start_time === form.end_time) {
        errs.end_time = t('bookings.validation.endTimeAfterStart')
      }
    } else {
      if (!form.check_in) errs.check_in = t('bookings.validation.checkInRequired')
      if (!form.check_out) errs.check_out = t('bookings.validation.checkOutRequired')
      if (form.check_in && form.check_out && form.check_in >= form.check_out) {
        errs.check_out = t('bookings.validation.checkOutAfterCheckIn')
      }
      if (!isStayTime(inTime)) errs.in_time = t('bookings.validation.timeInvalid')
      if (!isStayTime(outTime)) errs.out_time = t('bookings.validation.timeInvalid')
    }
    if (!form.guest_name.trim()) errs.guest_name = t('bookings.validation.guestNameRequired')
    if (!form.guest_phone.trim()) errs.guest_phone = t('bookings.validation.guestPhoneRequired')
    if (form.adults_count < 1) errs.adults_count = t('bookings.validation.adultsRequired')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function bookingPayload(): BookingCreateInput {
    return {
      property_id: form.property_id,
      check_in: effectiveCheckIn,
      check_out: effectiveCheckOut,
      rental_mode: rentalMode,
      guest_name: form.guest_name,
      guest_phone: form.guest_phone,
      guest_email: form.guest_email || undefined,
      source: form.source,
      adults_count: form.adults_count,
      children_count: form.children_count,
      notes: form.notes || undefined,
      agent_id: form.agent_id || undefined,
    }
  }

  function send(payload: BookingCreateInput) {
    createBooking.mutate(payload, {
      onSuccess: (booking) => {
        // Made from the chessboard, the booking's "Back" leads there again.
        navigate({
          to: '/bookings/$bookingId',
          params: { bookingId: booking.id },
          search: (prefill.from === 'gantt' ? { from: 'gantt' } : {}) as Record<string, string>,
        })
      },
      onError: (err) => {
        const broken = stayRuleBreaches(err)
        setRefused(broken ? { payload, breaches: broken } : null)
        if (broken) return
        const fieldError = getBookingFieldError(err, t)
        if (fieldError) {
          setErrors((prev) => ({ ...prev, [fieldError.field]: fieldError.message }))
        }
      },
    })
  }

  function handleSubmit() {
    if (!validate()) return
    send(bookingPayload())
  }


  function handleBack() {
    // Preserve navigation context when booking is opened from gantt range selection.
    if (prefill.from === 'gantt') {
      navigate({ to: '/properties/gantt' })
      return
    }
    navigate({ to: '/bookings' })
  }

  // Shown only while the form still says what was refused.
  const breaches = currentBreaches(refused, bookingPayload())

  function pickGuest(guest: Guest) {
    setForm((f) => ({ ...f, guest_name: guest.name, guest_phone: guest.phone, guest_email: guest.email || '' }))
    setErrors((e) => {
      const next = { ...e }
      delete next.guest_name
      delete next.guest_phone
      return next
    })
    setShowGuestSuggestions(false)
  }

  const suggestions = (field: 'phone' | 'name') =>
    guestQueryField === field && showGuestSuggestions && canSearchGuests && guestSuggestions.length > 0 ? (
      <ul className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-line bg-surface-card shadow-lg">
        {guestSuggestions.map((guest) => (
          <li key={guest.id}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickGuest(guest)}
              className="flex min-h-[44px] w-full flex-col justify-center px-3 py-2 text-left transition-colors hover:bg-surface-page"
            >
              <span className="text-sm font-semibold text-ink">{guest.name}</span>
              <span className="text-xs text-ink-muted">{guest.phone}</span>
            </button>
          </li>
        ))}
      </ul>
    ) : null

  const modeToggle = (
    <div>
      <span id="create-rental-mode-label" className={LABEL}>
        {t('bookings.rentalMode.label')}
      </span>
      <ToggleGroup
        aria-labelledby="create-rental-mode-label"
        type="single"
        value={rentalMode}
        onValueChange={(value) => value && switchMode(value as RentalMode)}
      >
        <ToggleGroupItem value="daily">{t('bookings.rentalMode.daily')}</ToggleGroupItem>
        <ToggleGroupItem value="hourly">{t('bookings.rentalMode.hourly')}</ToggleGroupItem>
      </ToggleGroup>
    </div>
  )

  const dates = isHourly ? (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="create-hourly-date" className={LABEL}>
          {t('bookings.date')}
        </label>
        <DatePicker
          id="create-hourly-date"
          value={form.hourly_date}
          onChange={(value) => updateField('hourly_date', value)}
          minDate={new Date()}
          placeholder={t('bookings.selectDates')}
          className={errors.check_in ? 'border-danger' : ''}
        />
        {errors.check_in && <p className={FIELD_ERROR}>{errors.check_in}</p>}
      </div>
      <HourlyTimes
        idPrefix="create-hours"
        start={form.start_time}
        end={form.end_time}
        pricing={pricing}
        onChange={({ start, end }) => {
          updateField('start_time', start)
          updateField('end_time', end)
        }}
        errors={{ start: errors.start_time, end: errors.end_time }}
      />
    </div>
  ) : (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="create-date-range" className={LABEL}>
          {t('bookings.dateRange')}
        </label>
        <DateRangePicker
          id="create-date-range"
          startDate={form.check_in}
          endDate={form.check_out}
          onRangeChange={(start, end) => {
            updateField('check_in', start)
            updateField('check_out', end)
          }}
          minDate={new Date()}
          placeholder={t('bookings.selectDates')}
          error={!!errors.check_in || !!errors.check_out}
          booked={booked.data}
          bookedLoading={booked.isLoading}
          bookedFailed={booked.isError}
          onBookedRetry={() => booked.refetch()}
          onMonthChange={setCalendarMonth}
        />
        {errors.check_in && <p className={FIELD_ERROR}>{errors.check_in}</p>}
        {errors.check_out && <p className={FIELD_ERROR}>{errors.check_out}</p>}
      </div>
      <div>
        <span id="create-in-time-label" className={LABEL}>
          {t('bookings.checkInTime')}
        </span>
        <TimeChips
          id="create-in-time"
          labelledBy="create-in-time-label"
          options={CHECK_IN_TIMES}
          value={inTime}
          onChange={(value) => updateField('in_time', value)}
        />
        {errors.in_time && <p className={FIELD_ERROR}>{errors.in_time}</p>}
      </div>
      <div>
        <span id="create-out-time-label" className={LABEL}>
          {t('bookings.checkOutTime')}
        </span>
        <TimeChips
          id="create-out-time"
          labelledBy="create-out-time-label"
          options={CHECK_OUT_TIMES}
          value={outTime}
          onChange={(value) => updateField('out_time', value)}
        />
        {errors.out_time && <p className={FIELD_ERROR}>{errors.out_time}</p>}
      </div>
    </div>
  )

  const counts = (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label htmlFor="create-adults" className={LABEL}>
          {t('bookings.adults')}
        </label>
        <NumberInput
          id="create-adults"
          value={form.adults_count}
          onChange={(value) => updateField('adults_count', Math.max(1, parseInt(value) || 1))}
          min={1}
          step={1}
          inputClassName={errors.adults_count ? 'border-danger' : ''}
        />
        {errors.adults_count && <p className={FIELD_ERROR}>{errors.adults_count}</p>}
      </div>
      <div>
        <label htmlFor="create-children" className={LABEL}>
          {t('bookings.children')}
        </label>
        <NumberInput
          id="create-children"
          value={form.children_count}
          onChange={(value) => updateField('children_count', Math.max(0, parseInt(value) || 0))}
          min={0}
          step={1}
        />
      </div>
    </div>
  )

  const freeObjects = (
    <Card title={t('miniapp.freeProperties')}>
      {!effectiveCheckIn || !effectiveCheckOut ? (
        <p className="text-sm text-ink-muted">
          {t('bookings.form.pickDatesFirst')}
        </p>
      ) : free.isLoading ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-ink-muted" aria-hidden="true" />
      ) : free.isError ? (
        <p className="text-sm text-danger">
          {t('bookings.form.freeFailed')}
        </p>
      ) : free.data && free.data.items.length === 0 ? (
        <p className="text-sm text-ink-muted">
          {t('bookings.form.noneFree')}
        </p>
      ) : (
        <div role="radiogroup" aria-label={t('miniapp.freeProperties')} className="flex flex-col gap-2">
          {free.data?.items.map((item) => {
            const on = form.property_id === item.property_id
            const cover = properties.find((p) => p.id === item.property_id)?.photos.find((photo) => photo.audience !== 'guest')
            return (
              <button
                key={item.property_id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => updateField('property_id', item.property_id)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                  on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-page'
                }`}
              >
                {cover ? (
                  <img src={cover.thumbnail_url || cover.url} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-page">
                    <Building2 className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-semibold ${on ? 'text-accent-ink' : 'text-ink'}`}>
                    {item.internal_name || item.name}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    {[item.name !== item.internal_name ? item.name : '', item.max_guests ? t('miniapp.unit.maxGuests', { count: item.max_guests }) : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-ink">
                  {item.total_price != null ? sum(item.total_price) : t('bookings.form.noPrice')}
                </span>
              </button>
            )
          })}
        </div>
      )}
      {taken && (
        <p className="mt-3 text-sm text-warning">
          {t('bookings.form.taken', { name: selectedProperty.internal_name || selectedProperty.name })}
        </p>
      )}
      {errors.property_id && <p className={FIELD_ERROR}>{errors.property_id}</p>}
    </Card>
  )

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
      <button
        type="button"
        onClick={handleBack}
        className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {prefill.from === 'gantt' ? t('bookings.backToGantt') : t('bookings.backToBookings')}
      </button>
      <h1 className="mb-5 text-xl font-bold text-ink">{t('bookings.newBooking')}</h1>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card title={t('bookings.form.when')}>
            <div className="flex flex-col gap-4">
              {modeToggle}
              {dates}
              {counts}
            </div>
          </Card>
          {freeObjects}

          <Card title={t('bookings.guest')}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="relative">
                <label htmlFor="create-guest-phone" className={LABEL}>
                  {t('bookings.phone')}
                </label>
                <input
                  id="create-guest-phone"
                  type="tel"
                  value={form.guest_phone}
                  onChange={(e) => {
                    updateField('guest_phone', e.target.value)
                    setGuestQueryField('phone')
                    setShowGuestSuggestions(true)
                  }}
                  onBlur={() => setTimeout(() => setShowGuestSuggestions(false), 200)}
                  placeholder={t('bookings.phonePlaceholder')}
                  className={`${FIELD} ${edge(errors.guest_phone)}`}
                />
                {errors.guest_phone && <p className={FIELD_ERROR}>{errors.guest_phone}</p>}
                {suggestions('phone')}
              </div>
              <div className="relative">
                <label htmlFor="create-guest-name" className={LABEL}>
                  {t('bookings.guestName')}
                </label>
                <input
                  id="create-guest-name"
                  type="text"
                  value={form.guest_name}
                  onChange={(e) => {
                    updateField('guest_name', e.target.value)
                    setGuestQueryField('name')
                    setShowGuestSuggestions(true)
                  }}
                  onBlur={() => setTimeout(() => setShowGuestSuggestions(false), 200)}
                  placeholder={t('bookings.guestNamePlaceholder')}
                  className={`${FIELD} ${edge(errors.guest_name)}`}
                />
                {errors.guest_name && <p className={FIELD_ERROR}>{errors.guest_name}</p>}
                {suggestions('name')}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="create-guest-email" className={LABEL}>
                  {t('bookings.email')}
                </label>
                <input
                  id="create-guest-email"
                  type="email"
                  value={form.guest_email}
                  onChange={(e) => updateField('guest_email', e.target.value)}
                  placeholder={t('bookings.emailOptional')}
                  className={`${FIELD} ${edge()}`}
                />
              </div>
            </div>
          </Card>

          <Card title={t('bookings.editBlock.source')}>
            <div className="flex flex-col gap-4">
              <div>
                <span id="create-source-label" className={LABEL}>
                  {t('bookings.source')}
                </span>
                <ToggleGroup
                  aria-labelledby="create-source-label"
                  type="single"
                  value={form.source}
                  onValueChange={(value) => value && updateField('source', value as BookingSource)}
                >
                  {SOURCES.map((s) => (
                    <ToggleGroupItem key={s.value} value={s.value}>
                      {s.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <div>
                <label htmlFor="create-agent" className={LABEL}>
                  {t('bookings.agent')}
                </label>
                <AgentSelect
                  id="create-agent"
                  value={form.agent_id}
                  onChange={(agentId) => updateField('agent_id', agentId)}
                  className={`${FIELD} ${edge()}`}
                />
              </div>
            </div>
          </Card>

          <Card title={t('bookings.editBlock.notes')}>
            <label htmlFor="create-notes" className="sr-only">
              {t('common.notes')}
            </label>
            <textarea
              id="create-notes"
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder={t('common.optionalNotes')}
              rows={3}
              className={`${FIELD} ${edge()} resize-none`}
            />
          </Card>
        </div>

        {/* The sum and the one action together: on a desk it stays in view while the form scrolls. */}
        <aside className="lg:sticky lg:top-6">
          <section className="rounded-2xl border border-line bg-surface-card p-5">
            <h2 className="text-sm font-bold text-ink">{t('bookings.priceBreakdown')}</h2>
            {selectedProperty && (
              <p id="create-property" className="mt-1 truncate text-sm text-ink-muted">
                {[selectedProperty.internal_name, selectedProperty.name !== selectedProperty.internal_name ? selectedProperty.name : '']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            <div className="mt-4">
              {!form.property_id || !effectiveCheckIn || !effectiveCheckOut ? (
                <p className="text-sm text-ink-muted">{t('bookings.selectPropertyAndDates')}</p>
              ) : priceLoading ? (
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-ink-muted" aria-hidden="true" />
              ) : priceData ? (
                <>
                  <dl className="flex flex-col gap-2 text-sm">
                    <PriceLine
                      label={
                        priceData.unit_label === 'hours'
                          ? t('bookings.hours', { count: priceData.hours })
                          : t('bookings.nights', { count: priceData.nights })
                      }
                      value={sum(priceData.base_total)}
                    />
                    {priceData.weekend_surcharge > 0 && (
                      <PriceLine label={t('bookings.weekendSurcharge')} value={`+${sum(priceData.weekend_surcharge)}`} />
                    )}
                    {priceData.seasonal_adjustment !== 0 && (
                      <PriceLine
                        label={t('bookings.seasonalAdjustment')}
                        value={`${priceData.seasonal_adjustment > 0 ? '+' : '-'}${sum(Math.abs(priceData.seasonal_adjustment))}`}
                      />
                    )}
                    {priceData.extra_guest_surcharge > 0 && (
                      <PriceLine label={t('bookings.extraGuestSurcharge')} value={`+${sum(priceData.extra_guest_surcharge)}`} />
                    )}
                    {priceData.discount_amount > 0 && (
                      <PriceLine label={t('bookings.discount')} value={`-${sum(priceData.discount_amount)}`} tone="text-success" />
                    )}
                  </dl>
                  <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-4">
                    <span className="text-sm font-semibold text-ink">{t('common.total')}</span>
                    <span className="text-2xl font-bold tabular-nums text-ink">{sum(priceData.total)}</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-danger">{t('bookings.unableToCalculate')}</p>
              )}
            </div>

            {breaches && refused && (
              <StayRulesAlert
                breaches={breaches}
                action={t('bookings.stayRules.bookAnyway')}
                busy={createBooking.isPending}
                onOverride={() => send({ ...refused.payload, override_rules: true })}
              />
            )}
            {createBooking.isError && !stayRuleBreaches(createBooking.error) && (
              <p role="alert" className="mt-4 rounded-xl bg-danger-soft p-3 text-sm text-danger">
                {getBookingApiErrorMessage(createBooking.error, t) || t('bookings.failedCreate')}
              </p>
            )}

            <Button
              className="mt-5 w-full"
              onClick={handleSubmit}
              disabled={createBooking.isPending || selectedProperty?.status === 'paused'}
            >
              {createBooking.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {t('bookings.addBooking')}
                </>
              )}
            </Button>
            <button
              type="button"
              onClick={handleBack}
              disabled={createBooking.isPending}
              className="mt-2 min-h-[44px] w-full rounded-xl text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-page hover:text-ink disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
          </section>
        </aside>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface-card p-5">
      <h2 className="mb-4 text-sm font-bold text-ink">{title}</h2>
      {children}
    </section>
  )
}

function PriceLine({ label, value, tone = 'text-ink' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`font-semibold tabular-nums ${tone}`}>{value}</dd>
    </div>
  )
}
