import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { ArrowLeft, Check, Loader2, Calculator, User, Phone, Mail } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useCreateBooking, useCalculatePrice, useGuests } from '../../hooks/useBookings'
import { useAllProperties } from '../../hooks/useProperties'
import type { BookingSource, BookingCreateInput, PriceCalculateInput } from '../../types/booking'
import DateRangePicker from '../../components/ui/date-range-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import NumberInput from '../../components/ui/number-input'
import { useCurrency } from '../../hooks/useCurrency'
import { getBookingApiErrorMessage, getBookingFieldError } from '../../lib/booking-errors'

interface FormData {
  property_id: string
  check_in: string
  check_out: string
  guest_name: string
  guest_phone: string
  guest_email: string
  source: BookingSource
  adults_count: number
  children_count: number
  gantt_color: string
  notes: string
}

const initialForm: FormData = {
  property_id: '',
  check_in: '',
  check_out: '',
  guest_name: '',
  guest_phone: '',
  guest_email: '',
  source: 'direct',
  adults_count: 1,
  children_count: 0,
  gantt_color: '#3B82F6',
  notes: '',
}

interface BookingPrefill {
  propertyId: string
  checkIn: string
  checkOut: string
  from: string
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
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
  const { t } = useTranslation()
  const { symbol } = useCurrency()
  const prefill = useMemo(() => getBookingPrefill(), [])
  const navigate = useNavigate()
  const createBooking = useCreateBooking()
  const [form, setForm] = useState<FormData>(() => ({
    ...initialForm,
    property_id: prefill.propertyId,
    check_in: prefill.checkIn,
    check_out: prefill.checkOut,
  }))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const guestSearch = form.guest_phone.trim()
  const canSearchGuests = guestSearch.length >= 2
  const [showGuestSuggestions, setShowGuestSuggestions] = useState(false)

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

  const { data: propertiesData } = useAllProperties()
  const properties = useMemo(
    () => (propertiesData?.items ?? []).filter((property) => property.status === 'active' || property.status === 'paused'),
    [propertiesData?.items],
  )
  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === form.property_id),
    [properties, form.property_id],
  )

  const { data: guestsData } = useGuests(
    { search: guestSearch, limit: 5 },
    canSearchGuests,
  )
  const guestSuggestions = canSearchGuests ? (guestsData?.items ?? []) : []

  // Debounced price calculation params
  const [debouncedPriceParams, setDebouncedPriceParams] = useState<PriceCalculateInput | null>(null)

  const priceParams = useMemo<PriceCalculateInput | null>(() => {
    if (!form.property_id || !form.check_in || !form.check_out) return null
    return {
      property_id: form.property_id,
      check_in: form.check_in,
      check_out: form.check_out,
      adults_count: form.adults_count,
      children_count: form.children_count,
    }
  }, [form.property_id, form.check_in, form.check_out, form.adults_count, form.children_count])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPriceParams(priceParams)
    }, 300)
    return () => clearTimeout(timer)
  }, [priceParams])

  const { data: priceData, isFetching: priceLoading } = useCalculatePrice(debouncedPriceParams)

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
    if (!form.property_id) errs.property_id = t('bookings.validation.propertyRequired')
    else if (!selectedProperty) errs.property_id = t('bookings.validation.propertyUnavailable')
    else if (selectedProperty.status === 'paused') errs.property_id = t('bookings.validation.propertyPaused')
    if (!form.check_in) errs.check_in = t('bookings.validation.checkInRequired')
    if (!form.check_out) errs.check_out = t('bookings.validation.checkOutRequired')
    if (form.check_in && form.check_out && form.check_in >= form.check_out) {
      errs.check_out = t('bookings.validation.checkOutAfterCheckIn')
    }
    if (!form.guest_name.trim()) errs.guest_name = t('bookings.validation.guestNameRequired')
    if (!form.guest_phone.trim()) errs.guest_phone = t('bookings.validation.guestPhoneRequired')
    if (form.adults_count < 1) errs.adults_count = t('bookings.validation.adultsRequired')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleSubmit() {
    if (!validate()) return

    const payload: BookingCreateInput = {
      property_id: form.property_id,
      check_in: form.check_in,
      check_out: form.check_out,
      guest_name: form.guest_name,
      guest_phone: form.guest_phone,
      guest_email: form.guest_email || undefined,
      source: form.source,
      adults_count: form.adults_count,
      children_count: form.children_count,
      gantt_color: form.gantt_color,
      notes: form.notes || undefined,
    }

    createBooking.mutate(payload, {
      onSuccess: (booking) => {
        navigate({ to: '/bookings/$bookingId', params: { bookingId: booking.id } })
      },
      onError: (err) => {
        const fieldError = getBookingFieldError(err, t)
        if (fieldError) {
          setErrors((prev) => ({ ...prev, [fieldError.field]: fieldError.message }))
        }
      },
    })
  }

  function handleBack() {
    // Preserve navigation context when booking is opened from gantt range selection.
    if (prefill.from === 'gantt') {
      navigate({ to: '/properties/gantt' })
      return
    }
    navigate({ to: '/bookings' })
  }

  return (
    <div className="p-6 max-w-6xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleBack}
            className="p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </motion.button>
          <h1 className="text-xl font-bold text-gray-900">{t('bookings.newBooking')}</h1>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="flex-1"
          >
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-5">
              {/* Property */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  {t('bookings.property')}
                </label>
                <Select
                  value={form.property_id || undefined}
                  onValueChange={(value) => updateField('property_id', value)}
                >
                  <SelectTrigger
                    className={errors.property_id ? 'border-red-300' : ''}
                  >
                    <SelectValue placeholder={t('bookings.selectProperty')} />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.internal_name} ({p.name}){p.status === 'paused' ? ' [paused]' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.property_id && (
                  <p className="text-xs text-red-500 mt-1">{errors.property_id}</p>
                )}
              </div>

              {/* Dates */}
              <div>
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
                  minDate={new Date()}
                  placeholder={t('bookings.selectDates')}
                  error={!!errors.check_in || !!errors.check_out}
                />
                {errors.check_in && (
                  <p className="text-xs text-red-500 mt-1">{errors.check_in}</p>
                )}
                {errors.check_out && (
                  <p className="text-xs text-red-500 mt-1">{errors.check_out}</p>
                )}
              </div>

              {/* Guest */}
              <div className="border-t border-gray-100 pt-5">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                  {t('bookings.guestInfo')}
                </h3>
                <div className="space-y-3">
                  <div className="relative">
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {t('bookings.phone')}</span>
                    </label>
                    <input
                      type="tel"
                      value={form.guest_phone}
                      onChange={(e) => {
                        updateField('guest_phone', e.target.value)
                        setShowGuestSuggestions(true)
                      }}
                      onBlur={() => setTimeout(() => setShowGuestSuggestions(false), 200)}
                      placeholder={t('bookings.phonePlaceholder')}
                      className={`w-full bg-gray-50 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm ${
                        errors.guest_phone ? 'border-red-300' : 'border-gray-200'
                      }`}
                    />
                    {errors.guest_phone && (
                      <p className="text-xs text-red-500 mt-1">{errors.guest_phone}</p>
                    )}

                    {/* Guest suggestions */}
                    {showGuestSuggestions && canSearchGuests && guestSuggestions.length > 0 && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                        {guestSuggestions.map((g) => (
                          <button
                            key={g.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setForm((f) => ({
                                ...f,
                                guest_name: g.name,
                                guest_phone: g.phone,
                                guest_email: g.email || '',
                              }))
                              setErrors((e) => {
                                const next = { ...e }
                                delete next.guest_name
                                delete next.guest_phone
                                return next
                              })
                              setShowGuestSuggestions(false)
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                          >
                            <span className="text-sm font-medium text-gray-900">{g.name}</span>
                            <span className="text-xs text-gray-500 ml-2">{g.phone}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" /> {t('bookings.guestName')}</span>
                    </label>
                    <input
                      type="text"
                      value={form.guest_name}
                      onChange={(e) => updateField('guest_name', e.target.value)}
                      placeholder={t('bookings.guestNamePlaceholder')}
                      className={`w-full bg-gray-50 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm ${
                        errors.guest_name ? 'border-red-300' : 'border-gray-200'
                      }`}
                    />
                    {errors.guest_name && (
                      <p className="text-xs text-red-500 mt-1">{errors.guest_name}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {t('bookings.email')}</span>
                    </label>
                    <input
                      type="email"
                      value={form.guest_email}
                      onChange={(e) => updateField('guest_email', e.target.value)}
                      placeholder={t('bookings.emailOptional')}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm"
                    />
                  </div>
                </div>
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
                  className="flex flex-wrap"
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
                <div className="grid grid-cols-2 gap-4">
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
                          layoutId="color-ring"
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

            {/* Error message */}
            {createBooking.isError && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-sm text-red-600">
                  {getBookingApiErrorMessage(createBooking.error, t) ||
                    t('bookings.failedCreate')}
                </p>
              </div>
            )}

            {/* Submit */}
            <div className="flex justify-end mt-6">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSubmit}
                disabled={createBooking.isPending || selectedProperty?.status === 'paused'}
                className="flex items-center gap-2 bg-black text-white hover:bg-gray-800 rounded-xl px-6 py-2.5 font-semibold shadow-lg transition-colors disabled:opacity-50"
              >
                {createBooking.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {t('bookings.addBooking')}
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>

          {/* Price Calculator Panel */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="lg:w-80 lg:sticky lg:top-6 lg:self-start"
          >
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <Calculator className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-bold text-gray-900">{t('bookings.priceBreakdown')}</h3>
              </div>

              {!form.property_id || !form.check_in || !form.check_out ? (
                <p className="text-xs text-gray-400">
                  {t('bookings.selectPropertyAndDates')}
                </p>
              ) : priceLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
                </div>
              ) : priceData ? (
                <div className="space-y-2">
                  <PriceLine label={t('bookings.nights', { count: priceData.nights })} amount={priceData.base_total} currencySymbol={symbol} />
                  {priceData.weekend_surcharge > 0 && (
                    <PriceLine label={t('bookings.weekendSurcharge')} amount={priceData.weekend_surcharge} currencySymbol={symbol} />
                  )}
                  {priceData.seasonal_adjustment !== 0 && (
                    <PriceLine
                      label={t('bookings.seasonalAdjustment')}
                      amount={priceData.seasonal_adjustment}
                      currencySymbol={symbol}
                      signed
                    />
                  )}
                  {priceData.extra_guest_surcharge > 0 && (
                    <PriceLine label={t('bookings.extraGuestSurcharge')} amount={priceData.extra_guest_surcharge} currencySymbol={symbol} />
                  )}
                  {priceData.discount_amount > 0 && (
                    <PriceLine label={t('bookings.discount')} amount={-priceData.discount_amount} currencySymbol={symbol} isDiscount />
                  )}
                  <div className="border-t border-gray-200 pt-2 mt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-gray-900">{t('common.total')}</span>
                      <span className="text-lg font-bold text-gray-900">
                        {symbol}{priceData.total.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">
                  {t('bookings.unableToCalculate')}
                </p>
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}

function PriceLine({
  label,
  amount,
  currencySymbol,
  isDiscount,
  signed,
}: {
  label: string
  amount: number
  currencySymbol: string
  isDiscount?: boolean
  signed?: boolean
}) {
  const signPrefix = signed ? (amount >= 0 ? '+' : '-') : isDiscount ? '-' : ''

  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-sm font-medium ${isDiscount ? 'text-green-600' : 'text-gray-900'}`}>
        {signPrefix}{currencySymbol}{Math.abs(amount).toLocaleString()}
      </span>
    </div>
  )
}
