import { useState } from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useBooking, useUpdateBooking } from '../../hooks/useBookings'
import { useProperty } from '../../hooks/useProperties'
import type { BookingDetail, BookingSource, BookingUpdateInput, RentalMode } from '../../types/booking'
import DateRangePicker from '../../components/ui/date-range-picker'
import DatePicker from '../../components/ui/date-picker'
import TimePicker from '../../components/ui/time-picker'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import NumberInput from '../../components/ui/number-input'
import Spinner from '../../components/ui/Spinner'
import { showToast } from '../../components/ui/Toast'
import { getBookingApiErrorMessage, getBookingFieldError } from '../../lib/booking-errors'

interface FormData {
  check_in: string
  check_out: string
  rental_mode: RentalMode
  hourly_date: string
  start_time: string
  end_time: string
  source: BookingSource
  adults_count: number
  children_count: number
  gantt_color: string
  notes: string
}

function datePart(value: string): string {
  const parsed = parseISO(value)
  return isValid(parsed) ? format(parsed, 'yyyy-MM-dd') : ''
}

function timePart(value: string): string {
  const parsed = parseISO(value)
  return isValid(parsed) ? format(parsed, 'HH:mm') : ''
}

function detailToForm(detail: BookingDetail): FormData {
  const b = detail.booking
  const isHourly = b.rental_mode === 'hourly'
  return {
    check_in: b.check_in,
    check_out: b.check_out,
    rental_mode: b.rental_mode,
    hourly_date: isHourly ? datePart(b.check_in) : '',
    start_time: isHourly ? timePart(b.check_in) : '',
    end_time: isHourly ? timePart(b.check_out) : '',
    source: b.source,
    adults_count: b.adults_count,
    children_count: b.children_count,
    gantt_color: b.gantt_color || '#3B82F6',
    notes: '',
  }
}

export default function EditBookingPage() {
  const { t } = useTranslation()
  const { bookingId } = useParams({ strict: false }) as { bookingId: string }
  const { data: detail, isLoading } = useBooking(bookingId)

  if (isLoading) {
    return <Spinner />
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-gray-500">{t('bookings.notFound')}</p>
      </div>
    )
  }

  return <EditBookingForm key={detail.booking.id} detail={detail} bookingId={bookingId} />
}

function EditBookingForm({ detail, bookingId }: { detail: BookingDetail; bookingId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const updateBooking = useUpdateBooking(bookingId)
  const { data: property } = useProperty(detail.booking.property_id)
  const [form, setForm] = useState<FormData>(() => detailToForm(detail))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isHourly = form.rental_mode === 'hourly'
  const effectiveCheckIn = isHourly
    ? form.hourly_date && form.start_time
      ? `${form.hourly_date}T${form.start_time}:00`
      : ''
    : form.check_in
  const effectiveCheckOut = isHourly
    ? form.hourly_date && form.end_time
      ? `${form.hourly_date}T${form.end_time}:00`
      : ''
    : form.check_out

  const SOURCES: { value: BookingSource; label: string }[] = [
    { value: 'direct', label: t('bookings.sources.direct') },
    { value: 'booking', label: t('bookings.sources.booking') },
    { value: 'airbnb', label: t('bookings.sources.airbnb') },
    { value: 'other', label: t('bookings.sources.other') },
  ]

  const GANTT_COLORS = [
    { value: '#3B82F6', label: t('bookings.colors.blue') },
    { value: '#10B981', label: t('bookings.colors.green') },
    { value: '#F59E0B', label: t('bookings.colors.amber') },
    { value: '#EF4444', label: t('bookings.colors.red') },
    { value: '#8B5CF6', label: t('bookings.colors.purple') },
    { value: '#EC4899', label: t('bookings.colors.pink') },
    { value: '#06B6D4', label: t('bookings.colors.cyan') },
  ]

  function updateField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => {
      const next = { ...e }
      delete next[key]
      return next
    })
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (isHourly) {
      if (!form.hourly_date) errs.check_in = t('bookings.validation.dateRequired')
      if (!form.start_time) errs.start_time = t('bookings.validation.startTimeRequired')
      if (!form.end_time) errs.end_time = t('bookings.validation.endTimeRequired')
      if (form.start_time && form.end_time && form.start_time >= form.end_time) {
        errs.end_time = t('bookings.validation.endTimeAfterStart')
      }
    } else {
      if (!form.check_in) errs.check_in = t('bookings.validation.checkInRequired')
      if (!form.check_out) errs.check_out = t('bookings.validation.checkOutRequired')
      if (form.check_in && form.check_out && form.check_in >= form.check_out) {
        errs.check_out = t('bookings.validation.checkOutAfterCheckIn')
      }
    }
    if (form.adults_count < 1) errs.adults_count = t('bookings.validation.adultsRequired')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit() {
    if (!validate()) return

    const payload: BookingUpdateInput = {
      check_in: effectiveCheckIn,
      check_out: effectiveCheckOut,
      rental_mode: form.rental_mode,
      source: form.source,
      adults_count: form.adults_count,
      children_count: form.children_count,
      gantt_color: form.gantt_color,
      notes: form.notes || undefined,
    }

    updateBooking.mutate(payload, {
      onSuccess: () => {
        showToast('success', t('bookings.bookingUpdated'))
        navigate({ to: '/bookings/$bookingId', params: { bookingId } })
      },
      onError: (err) => {
        const fieldError = getBookingFieldError(err, t)
        if (fieldError) {
          setErrors((prev) => ({ ...prev, [fieldError.field]: fieldError.message }))
        }
        showToast('error', getBookingApiErrorMessage(err, t) || t('bookings.failedUpdate'))
      },
    })
  }

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-3xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate({ to: '/bookings/$bookingId', params: { bookingId } })}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ArrowLeft className="w-4 h-4" />
          </motion.button>
          <h1 className="text-xl font-bold text-gray-900">{t('bookings.editBooking')}</h1>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-5">
          {/* Guest info (read-only) */}
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">{t('bookings.guest')}</p>
            <p className="text-sm font-semibold text-gray-900">{detail.guest.name}</p>
            <p className="text-xs text-gray-500">{detail.guest.phone}</p>
          </div>

          {/* Rental mode toggle - only for properties that allow both */}
          {property?.rental_mode === 'both' && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                {t('bookings.rentalMode.label')}
              </label>
              <ToggleGroup
                type="single"
                value={form.rental_mode}
                onValueChange={(value) => {
                  if (!value) return
                  updateField('rental_mode', value as RentalMode)
                }}
              >
                <ToggleGroupItem value="daily">{t('bookings.rentalMode.daily')}</ToggleGroupItem>
                <ToggleGroupItem value="hourly">{t('bookings.rentalMode.hourly')}</ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}

          {/* Dates */}
          <div>
            {isHourly ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    {t('bookings.date')}
                  </label>
                  <DatePicker
                    value={form.hourly_date}
                    onChange={(value) => updateField('hourly_date', value)}
                    placeholder={t('bookings.selectDates')}
                    className={errors.check_in ? 'border-red-300' : ''}
                  />
                  {errors.check_in && (
                    <p className="text-xs text-red-500 mt-1">{errors.check_in}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      {t('bookings.startTime')}
                    </label>
                    <TimePicker
                      value={form.start_time}
                      onChange={(value) => updateField('start_time', value)}
                      placeholder={t('bookings.selectTime')}
                      className={errors.start_time ? 'border-red-300' : ''}
                    />
                    {errors.start_time && (
                      <p className="text-xs text-red-500 mt-1">{errors.start_time}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      {t('bookings.endTime')}
                    </label>
                    <TimePicker
                      value={form.end_time}
                      onChange={(value) => updateField('end_time', value)}
                      placeholder={t('bookings.selectTime')}
                      className={errors.end_time ? 'border-red-300' : ''}
                    />
                    {errors.end_time && (
                      <p className="text-xs text-red-500 mt-1">{errors.end_time}</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  {t('bookings.dateRange')}
                </label>
                <DateRangePicker
                  startDate={form.check_in}
                  endDate={form.check_out}
                  onRangeChange={(start, end) => {
                    updateField('check_in', start)
                    updateField('check_out', end)
                  }}
                  placeholder={t('bookings.selectDates')}
                  error={!!errors.check_in || !!errors.check_out}
                />
                {errors.check_in && (
                  <p className="text-xs text-red-500 mt-1">{errors.check_in}</p>
                )}
                {errors.check_out && (
                  <p className="text-xs text-red-500 mt-1">{errors.check_out}</p>
                )}
              </>
            )}
          </div>

          {/* Source */}
          <div className="border-t border-gray-100 pt-5">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              {t('bookings.source')}
            </label>
            <ToggleGroup
              type="single"
              value={form.source}
              onValueChange={(value) => {
                if (!value) return
                updateField('source', value as BookingSource)
              }}
            >
              {SOURCES.map((s) => (
                <ToggleGroupItem key={s.value} value={s.value}>
                  {s.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {/* Guests Count */}
          <div className="border-t border-gray-100 pt-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  {t('bookings.adults')}
                </label>
                <NumberInput
                  value={form.adults_count}
                  onChange={(value) =>
                    updateField('adults_count', Math.max(1, parseInt(value) || 1))
                  }
                  min={1}
                  step={1}
                  inputClassName={errors.adults_count ? 'border-red-300' : ''}
                />
                {errors.adults_count && (
                  <p className="text-xs text-red-500 mt-1">{errors.adults_count}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  {t('bookings.children')}
                </label>
                <NumberInput
                  value={form.children_count}
                  onChange={(value) =>
                    updateField('children_count', Math.max(0, parseInt(value) || 0))
                  }
                  min={0}
                  step={1}
                />
              </div>
            </div>
          </div>

          {/* Gantt Color */}
          <div className="border-t border-gray-100 pt-5">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              {t('bookings.calendarColor')}
            </label>
            <div className="flex gap-2">
              {GANTT_COLORS.map((c) => (
                <motion.button
                  key={c.value}
                  whileTap={{ scale: 0.9 }}
                  type="button"
                  onClick={() => updateField('gantt_color', c.value)}
                  className="relative w-8 h-8 rounded-full transition-transform"
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                >
                  {form.gantt_color === c.value && (
                    <motion.div
                      layoutId="edit-color-ring"
                      className="absolute inset-[-3px] rounded-full border-2 border-gray-900"
                    />
                  )}
                </motion.button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="border-t border-gray-100 pt-5">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              {t('common.notes')}
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              placeholder={t('common.optionalNotes')}
              rows={3}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm resize-none"
            />
          </div>
        </div>

        {/* Submit */}
        <div className="mt-6 flex justify-end">
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={handleSubmit}
            disabled={updateBooking.isPending}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-2.5 font-semibold text-white shadow-lg transition-colors hover:bg-gray-800 disabled:opacity-50 sm:w-auto"
          >
            {updateBooking.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4" />
                {t('common.saveChanges')}
              </>
            )}
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}
