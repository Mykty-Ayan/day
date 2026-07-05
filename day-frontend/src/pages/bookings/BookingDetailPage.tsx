import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Users,
  DollarSign,
  FileText,
  MessageSquare,
  Plus,
  Download,
  Trash2,
  Loader2,
  Send,
  Pencil,
} from 'lucide-react'
import { useNavigate, useParams } from '@tanstack/react-router'
import Spinner from '../../components/ui/Spinner'
import {
  useBooking,
  useChangeBookingStatus,
  useAddPayment,
  useCreateDeposit,
  useDepositAction,
  useAddComment,
  useUploadBookingFile,
  useDeleteBookingFile,
} from '../../hooks/useBookings'
import type {
  Booking,
  BookingAuditLog,
  BookingComment,
  BookingDeposit,
  BookingFile,
  BookingPayment,
  BookingStatus,
  DepositAction,
  DepositActionInput,
  DepositStatus,
  Guest,
  PaymentInput,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '../../types/booking'
import type { ViewMode } from '../../types/view-mode'
import { isViewMode } from '../../types/view-mode'
import BookingStatusBadge from '../../components/booking/BookingStatusBadge'
import AuditTrail from '../../components/ui/AuditTrail'
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

const TABS = ['overview', 'payments', 'deposits', 'filesComments', 'history'] as const
type Tab = (typeof TABS)[number]

const RAW_API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
const BOOKING_DETAIL_PAYMENTS_VIEW_MODE_STORAGE_KEY = 'day:bookings:detail:payments-view-mode'
const BOOKING_DETAIL_DEPOSITS_VIEW_MODE_STORAGE_KEY = 'day:bookings:detail:deposits-view-mode'

function apiUrl(path: string): string {
  const trimmedBase = RAW_API_BASE_URL.replace(/\/+$/, '')
  const normalizedBase = /^https?:\/\//.test(trimmedBase)
    ? trimmedBase
    : `/${trimmedBase.replace(/^\/+/, '')}`
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

function readInitialViewMode(storageKey: string): ViewMode {
  if (typeof window === 'undefined') return 'table'

  try {
    const stored = window.localStorage.getItem(storageKey)
    if (isViewMode(stored)) {
      return stored
    }
  } catch {
    // Ignore storage errors and fallback to viewport-aware default.
  }

  return window.matchMedia('(max-width: 1023px)').matches ? 'cards' : 'table'
}

interface StatusAction {
  label: string
  target: BookingStatus
  color: string
}

function getStatusActions(status: BookingStatus, t: (key: string) => string): StatusAction[] {
  switch (status) {
    case 'pending':
      return [
        { label: t('bookings.status.confirm'), target: 'confirmed', color: 'bg-blue-600 hover:bg-blue-700' },
        { label: t('bookings.status.cancel'), target: 'cancelled', color: 'bg-red-600 hover:bg-red-700' },
      ]
    case 'confirmed':
      return [
        { label: t('bookings.status.checkIn'), target: 'checked_in', color: 'bg-emerald-600 hover:bg-emerald-700' },
        { label: t('bookings.status.cancel'), target: 'cancelled', color: 'bg-red-600 hover:bg-red-700' },
      ]
    case 'checked_in':
      return [
        { label: t('bookings.status.checkOut'), target: 'checked_out', color: 'bg-amber-600 hover:bg-amber-700' },
      ]
    case 'checked_out':
      return [
        { label: t('bookings.status.complete'), target: 'completed', color: 'bg-green-600 hover:bg-green-700' },
      ]
    default:
      return []
  }
}

export default function BookingDetailPage() {
  const { t, i18n } = useTranslation()
  const { bookingId } = useParams({ strict: false }) as { bookingId: string }
  const navigate = useNavigate()
  const { data: detail, isLoading } = useBooking(bookingId)
  const changeStatus = useChangeBookingStatus(bookingId)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [paymentsViewMode, setPaymentsViewMode] = useState<ViewMode>(() =>
    readInitialViewMode(BOOKING_DETAIL_PAYMENTS_VIEW_MODE_STORAGE_KEY),
  )
  const [depositsViewMode, setDepositsViewMode] = useState<ViewMode>(() =>
    readInitialViewMode(BOOKING_DETAIL_DEPOSITS_VIEW_MODE_STORAGE_KEY),
  )
  const from = useMemo(() => {
    if (typeof window === 'undefined') return ''
    const params = new URLSearchParams(window.location.search)
    return params.get('from') || ''
  }, [])
  const isFromGantt = from === 'gantt'

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(BOOKING_DETAIL_PAYMENTS_VIEW_MODE_STORAGE_KEY, paymentsViewMode)
    } catch {
      // Ignore storage write errors.
    }
  }, [paymentsViewMode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(BOOKING_DETAIL_DEPOSITS_VIEW_MODE_STORAGE_KEY, depositsViewMode)
    } catch {
      // Ignore storage write errors.
    }
  }, [depositsViewMode])

  function handleBack() {
    if (isFromGantt) {
      navigate({ to: '/properties/gantt' })
      return
    }
    navigate({ to: '/bookings' })
  }

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

  const { booking, guest } = detail
  const statusActions = getStatusActions(booking.status, t)

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-5xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Back */}
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {isFromGantt ? t('bookings.backToGantt') : t('bookings.backToBookings')}
        </button>

        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="text-xl font-bold text-gray-900">
                {booking.property_internal_name || booking.property_name}
              </h1>
              <BookingStatusBadge status={booking.status} />
            </div>
            <p className="text-sm text-gray-500">
              {booking.guest_name} &middot; {formatDate(booking.check_in, i18n.language)} <ArrowRight className="w-3 h-3 inline text-gray-400" /> {formatDate(booking.check_out, i18n.language)}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate({ to: '/bookings/$bookingId/edit', params: { bookingId } })}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-100 sm:w-auto"
            >
              <Pencil className="w-3.5 h-3.5" />
              {t('common.edit')}
            </motion.button>
            {statusActions.map((action) => (
              <motion.button
                key={action.target}
                whileTap={{ scale: 0.97 }}
                onClick={() => changeStatus.mutate(action.target)}
                disabled={changeStatus.isPending}
                className={`${action.color} min-h-[44px] w-full rounded-xl px-4 py-2 text-xs font-bold text-white transition-colors disabled:opacity-50 sm:w-auto`}
              >
                {action.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Tab bar */}
        <div className="mb-6 -mx-1 overflow-x-auto px-1">
          <div className="inline-flex min-w-full gap-1 rounded-xl bg-gray-50 p-1 sm:min-w-0" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`min-h-[44px] whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                  activeTab === tab
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t(`bookings.tabs.${tab}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'overview' && (
              <OverviewTab booking={booking} guest={guest} />
            )}
            {activeTab === 'payments' && (
              <PaymentsTab
                bookingId={bookingId}
                payments={detail.payments}
                totalPrice={booking.total_price}
                checkIn={booking.check_in}
                checkOut={booking.check_out}
                viewMode={paymentsViewMode}
                onViewModeChange={setPaymentsViewMode}
              />
            )}
            {activeTab === 'deposits' && (
              <DepositsTab
                bookingId={bookingId}
                deposits={detail.deposits}
                viewMode={depositsViewMode}
                onViewModeChange={setDepositsViewMode}
              />
            )}
            {activeTab === 'filesComments' && (
              <FilesCommentsTab bookingId={bookingId} files={detail.files} comments={detail.comments} />
            )}
            {activeTab === 'history' && (
              <HistoryTab auditLogs={detail.audit_logs} />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

// --- Overview Tab ---
function OverviewTab({ booking, guest }: { booking: Booking; guest: Guest }) {
  const { t, i18n } = useTranslation()
  const { symbol } = useCurrency()

  const guestCountStr = (() => {
    let str = t('bookings.adultsCount', { count: booking.adults_count })
    if (booking.children_count > 0) {
      str += `, ${t('bookings.childrenCount', { count: booking.children_count })}`
    }
    return str
  })()

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Booking Info */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 mb-4">{t('bookings.bookingDetails')}</h2>
        <div className="space-y-3">
          <InfoRow icon={Calendar} label={t('properties.checkIn')} value={formatDate(booking.check_in, i18n.language)} />
          <InfoRow icon={Calendar} label={t('properties.checkOut')} value={formatDate(booking.check_out, i18n.language)} />
          <InfoRow icon={Users} label={t('bookings.guest')} value={guestCountStr} />
          <InfoRow icon={DollarSign} label={t('bookings.totalPrice')} value={`${symbol}${formatMoney(booking.total_price)}`} />
          <div className="flex items-center gap-3 pt-1">
            <span className="text-xs text-gray-500 w-24">{t('bookings.source')}</span>
            <span className="text-sm text-gray-900 capitalize">{t('bookings.sources.' + booking.source)}</span>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <span className="text-xs text-gray-500 w-24">{t('bookings.calendarColor')}</span>
            <div className="w-5 h-5 rounded-full" style={{ backgroundColor: booking.gantt_color || '#3B82F6' }} />
          </div>
        </div>
      </div>

      {/* Guest Info */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 mb-4">{t('bookings.guest')}</h2>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-500">{t('bookings.guestName')}</p>
            <p className="text-sm font-semibold text-gray-900">{guest.name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">{t('bookings.phone')}</p>
            <p className="text-sm text-gray-900">{guest.phone}</p>
          </div>
          {guest.email && (
            <div>
              <p className="text-xs text-gray-500">{t('bookings.email')}</p>
              <p className="text-sm text-gray-900">{guest.email}</p>
            </div>
          )}
          {guest.notes && (
            <div>
              <p className="text-xs text-gray-500">{t('common.notes')}</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{guest.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-gray-400" />
      <span className="text-xs text-gray-500 w-20">{label}</span>
      <span className="text-sm font-semibold text-gray-900">{value}</span>
    </div>
  )
}

const moneyFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const moneyChipFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})

function normalizeNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, '').replace(',', '.')
    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function formatMoney(value: number | string | null | undefined): string {
  return moneyFormatter.format(normalizeNumber(value))
}

function formatMoneyChip(value: number | string | null | undefined): string {
  return moneyChipFormatter.format(normalizeNumber(value))
}

// --- Payments Tab ---
function PaymentsTab({
  bookingId,
  payments,
  totalPrice,
  checkIn,
  checkOut,
  viewMode,
  onViewModeChange,
}: {
  bookingId: string
  payments: BookingPayment[]
  totalPrice: number
  checkIn: string
  checkOut: string
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}) {
  const { t } = useTranslation()
  const { symbol } = useCurrency()
  const addPayment = useAddPayment(bookingId)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ amount: '', type: 'payment' as PaymentType, method: 'cash' as PaymentMethod, note: '' })
  const amountStep = 1000
  const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
    { value: 'cards', label: t('common.cards') },
    { value: 'table', label: t('common.table') },
  ]

  const paymentTypeLabels: Record<PaymentType, string> = {
    payment: t('bookings.payments.payment'),
    refund: t('bookings.payments.refund'),
  }
  const paymentMethodLabels: Record<PaymentMethod, string> = {
    cash: t('common.cash'),
    card: t('common.card'),
    transfer: t('common.transfer'),
  }
  const paymentStatusLabels: Record<PaymentStatus, string> = {
    pending: t('bookings.payments.paymentStatus.pending'),
    completed: t('bookings.payments.paymentStatus.completed'),
    failed: t('bookings.payments.paymentStatus.failed'),
  }

  const totalPaid = payments
    .filter((p) => p.status === 'completed')
    .reduce((sum, p) => {
      const amount = normalizeNumber(p.amount)
      return sum + (p.type === 'payment' ? amount : -amount)
    }, 0)
  const total = normalizeNumber(totalPrice)
  const remaining = total - totalPaid
  const isOverpaid = remaining < 0
  const overpaid = Math.max(0, -remaining)
  const payableRemaining = Math.max(0, remaining)
  const refundableAmount = Math.max(0, totalPaid)
  const nightsMs =
    new Date(`${checkOut}T00:00:00Z`).getTime() - new Date(`${checkIn}T00:00:00Z`).getTime()
  const nights = Math.max(1, Math.round(nightsMs / (24 * 60 * 60 * 1000)))
  const nightlyRate = total > 0 ? total / nights : 0

  const quickOptionsRaw =
    form.type === 'payment'
      ? [
          { label: '100%', value: total },
          { label: '50%', value: total * 0.5 },
          { label: t('bookings.payments.daily'), value: nightlyRate },
        ]
      : [
          ...(isOverpaid ? [{ label: t('bookings.payments.overpaid'), value: overpaid }] : []),
          { label: t('common.total'), value: refundableAmount },
          { label: '50%', value: refundableAmount * 0.5 },
          { label: t('bookings.payments.firstDay'), value: nightlyRate },
        ]

  const seenQuickValues = new Set<number>()
  const quickOptions = quickOptionsRaw.filter(({ value }) => {
    if (!Number.isFinite(value) || value <= 0) return false
    if (seenQuickValues.has(value)) return false
    seenQuickValues.add(value)
    return true
  })

  function handleSubmit() {
    const amount = normalizeNumber(form.amount)
    if (!amount || amount <= 0) return
    addPayment.mutate(
      { amount, type: form.type, method: form.method, note: form.note || undefined } as PaymentInput,
      {
        onSuccess: () => {
          setForm({ amount: '', type: 'payment', method: 'cash', note: '' })
          setShowForm(false)
        },
      },
    )
  }

  function paymentStatusStyle(status: BookingPayment['status']): string {
    if (status === 'completed') return 'bg-green-100 text-green-700'
    if (status === 'failed') return 'bg-red-100 text-red-700'
    return 'bg-gray-100 text-gray-700'
  }

  return (
    <div className="space-y-4">
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(value) => {
          if (!value) return
          onViewModeChange(value as ViewMode)
        }}
      >
        {VIEW_OPTIONS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {/* Summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-gray-500">
            {isOverpaid ? t('bookings.payments.totalPaidOverpaid') : t('bookings.payments.totalPaidRemaining')}
          </p>
          <p className="text-sm font-bold text-gray-900">
            {symbol}{formatMoney(total)} / {symbol}{formatMoney(totalPaid)} /{' '}
            <span className={isOverpaid ? 'text-red-600' : ''}>
              {symbol}{formatMoney(isOverpaid ? overpaid : payableRemaining)}
            </span>
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => { setForm((f) => ({ ...f, type: 'payment' })); setShowForm(true) }}
            className="flex min-h-[44px] w-full items-center justify-center gap-1 rounded-xl bg-black px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-gray-800 sm:w-auto"
          >
            <Plus className="w-3 h-3" /> {t('bookings.payments.addPayment')}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => { setForm((f) => ({ ...f, type: 'refund' })); setShowForm(true) }}
            className="flex min-h-[44px] w-full items-center justify-center gap-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-100 sm:w-auto"
          >
            <Plus className="w-3 h-3" /> {t('bookings.payments.addRefund')}
          </motion.button>
        </div>
      </div>

      {/* Add payment form */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"
        >
          <h3 className="text-sm font-bold text-gray-900 mb-3">
            {form.type === 'payment' ? t('bookings.payments.addPayment') : t('bookings.payments.addRefund')}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <NumberInput
              value={form.amount}
              onChange={(value) => setForm((f) => ({ ...f, amount: value }))}
              min={0}
              step={amountStep}
              placeholder={t('common.amount')}
              ariaLabel={t('common.amount')}
            />
            <Select
              value={form.method}
              onValueChange={(value) => setForm((f) => ({ ...f, method: value as PaymentMethod }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{t('common.cash')}</SelectItem>
                <SelectItem value="card">{t('common.card')}</SelectItem>
                <SelectItem value="transfer">{t('common.transfer')}</SelectItem>
              </SelectContent>
            </Select>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder={t('common.noteOptional')}
              aria-label={t('common.noteOptional')}
              className="bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm"
            />
          </div>
          {quickOptions.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {quickOptions.map((option) => (
                <button
                  key={`${form.type}-${option.label}-${option.value}`}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, amount: String(option.value) }))}
                  className="px-3 py-1.5 rounded-full border border-gray-200 bg-white hover:bg-gray-900 hover:text-white text-xs font-semibold text-gray-700 transition-all"
                >
                  {option.label} ({symbol}{formatMoney(option.value)})
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row">
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={handleSubmit}
              disabled={addPayment.isPending}
              aria-label="Save"
              className="min-h-[44px] w-full rounded-xl bg-black px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-gray-800 disabled:opacity-50 sm:w-auto"
            >
              {addPayment.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : t('common.save')}
            </motion.button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="min-h-[44px] w-full rounded-xl border border-gray-200 px-3 text-xs font-bold text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 sm:w-auto sm:border-0"
            >
              {t('common.cancel')}
            </button>
          </div>
        </motion.div>
      )}

      {/* Payment list */}
      {payments.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-sm text-gray-500 text-center py-4">{t('bookings.payments.noPayments')}</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="space-y-3">
          {payments.map((payment) => (
            <div key={payment.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {payment.type === 'refund' ? '-' : ''}{symbol}{formatMoney(Math.abs(normalizeNumber(payment.amount)))}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {paymentTypeLabels[payment.type]} · {paymentMethodLabels[payment.method]}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${paymentStatusStyle(payment.status)}`}>
                  {paymentStatusLabels[payment.status]}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-1 text-xs text-gray-600 sm:grid-cols-2">
                <span>{new Date(payment.paid_at || payment.created_at).toLocaleDateString()}</span>
                <span className="sm:text-right">{payment.note || '-'}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[680px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">{t('common.amount')}</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">{t('common.type')}</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">{t('common.method')}</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">{t('common.status')}</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">{t('common.date')}</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase">{t('common.note')}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50">
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                      {p.type === 'refund' ? '-' : ''}{symbol}{formatMoney(Math.abs(normalizeNumber(p.amount)))}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{paymentTypeLabels[p.type]}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{paymentMethodLabels[p.method]}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${paymentStatusStyle(p.status)}`}>
                        {paymentStatusLabels[p.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(p.paid_at || p.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{p.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Deposits Tab ---
function DepositsTab({
  bookingId,
  deposits,
  viewMode,
  onViewModeChange,
}: {
  bookingId: string
  deposits: BookingDeposit[]
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
}) {
  const { t } = useTranslation()
  const { symbol } = useCurrency()
  const createDep = useCreateDeposit(bookingId)
  const [newAmount, setNewAmount] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
    { value: 'cards', label: t('common.cards') },
    { value: 'table', label: t('common.table') },
  ]
  const quickDepositOptions = [
    { value: 5000 },
    { value: 10000 },
    { value: 20000 },
  ]

  function handleCreate() {
    const amount = normalizeNumber(newAmount)
    if (!amount || amount <= 0) return
    createDep.mutate(
      { amount },
      { onSuccess: () => { setNewAmount(''); setShowCreate(false) } },
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => {
            if (!value) return
            onViewModeChange(value as ViewMode)
          }}
        >
          {VIEW_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowCreate(true)}
          className="flex min-h-[44px] w-full items-center justify-center gap-1 rounded-xl bg-black px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-gray-800 sm:w-auto"
        >
          <Plus className="w-3 h-3" /> {t('bookings.deposits.createDeposit')}
        </motion.button>
      </div>

      {showCreate && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"
        >
          <h3 className="text-sm font-bold text-gray-900 mb-3">{t('bookings.deposits.newDeposit')}</h3>
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <NumberInput
                value={newAmount}
                onChange={setNewAmount}
                min={0}
                step={1000}
                placeholder={t('common.amount')}
                ariaLabel={t('common.amount')}
                className="w-full sm:flex-1"
              />
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={handleCreate}
                disabled={createDep.isPending}
                className="min-h-[44px] w-full rounded-xl bg-black px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-gray-800 disabled:opacity-50 sm:w-auto"
              >
                {createDep.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : t('common.create')}
              </motion.button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="min-h-[44px] w-full rounded-xl border border-gray-200 px-2 text-xs font-bold text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 sm:w-auto sm:border-0"
              >
                {t('common.cancel')}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {quickDepositOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setNewAmount(String(option.value))}
                  className="px-3 py-1.5 rounded-full border border-gray-200 bg-white hover:bg-gray-900 hover:text-white text-xs font-semibold text-gray-700 transition-all"
                >
                  {symbol}{formatMoneyChip(option.value)}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {deposits.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-sm text-gray-500 text-center py-4">{t('bookings.deposits.noDeposits')}</p>
        </div>
      ) : viewMode === 'cards' ? (
        deposits.map((dep) => (
          <DepositCard key={`${dep.id}-${dep.status}`} bookingId={bookingId} deposit={dep} />
        ))
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-400">{t('common.amount')}</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-400">{t('common.status')}</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-400">{t('bookings.deposits.held')}</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-400">{t('common.reason')}</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-400">{t('common.created')}</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase text-gray-400">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((dep) => (
                  <DepositTableRow key={`${dep.id}-${dep.status}`} bookingId={bookingId} deposit={dep} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function DepositCard({ bookingId, deposit }: { bookingId: string; deposit: BookingDeposit }) {
  const { t } = useTranslation()
  const { symbol } = useCurrency()
  const depAction = useDepositAction(bookingId, deposit.id)
  const [actionForm, setActionForm] = useState<{ action: DepositAction; held_amount: string; reason: string } | null>(null)

  function handleAction() {
    if (!actionForm) return
    const input: DepositActionInput = {
      action: actionForm.action,
      ...(actionForm.action === 'partial_hold' && { held_amount: normalizeNumber(actionForm.held_amount) }),
      ...((actionForm.action === 'hold' || actionForm.action === 'partial_hold') && actionForm.reason && { reason: actionForm.reason }),
    }
    depAction.mutate(input, { onSuccess: () => setActionForm(null) })
  }

  const depositStatusStyle: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700',
    paid: 'bg-blue-100 text-blue-700',
    returned: 'bg-green-100 text-green-700',
    held: 'bg-red-100 text-red-700',
    partially_held: 'bg-amber-100 text-amber-700',
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-bold text-gray-900">{symbol}{formatMoney(deposit.amount)}</p>
          {deposit.held_amount > 0 && (
            <p className="text-xs text-gray-500">{t('bookings.deposits.held')} {symbol}{formatMoney(deposit.held_amount)}</p>
          )}
        </div>
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${depositStatusStyle[deposit.status] || 'bg-gray-100 text-gray-700'}`}>
          {depositStatusLabel(t, deposit.status)}
        </span>
      </div>
      {deposit.reason && (
        <p className="text-xs text-gray-500 mb-3">{t('common.reason')} {deposit.reason}</p>
      )}

      {/* Actions based on status */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {deposit.status === 'pending' && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={() => {
              setActionForm(null)
              depAction.mutate({ action: 'pay' })
            }}
            disabled={depAction.isPending}
            className="min-h-[44px] w-full rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 sm:w-auto"
          >
            {t('bookings.deposits.markAsPaid')}
          </motion.button>
        )}
        {deposit.status === 'paid' && (
          <>
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={() => {
                setActionForm(null)
                depAction.mutate({ action: 'return' })
              }}
              disabled={depAction.isPending}
              className="min-h-[44px] w-full rounded-xl bg-green-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-50 sm:w-auto"
            >
              {t('bookings.deposits.return')}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={() => setActionForm({ action: 'hold', held_amount: '', reason: '' })}
              aria-label={t('bookings.deposits.hold')}
              className="min-h-[44px] w-full rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-700 sm:w-auto"
            >
              {t('bookings.deposits.hold')}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={() => setActionForm({ action: 'partial_hold', held_amount: '', reason: '' })}
              aria-label="Partial"
              className="min-h-[44px] w-full rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-700 sm:w-auto"
            >
              {t('bookings.deposits.partiallyHold')}
            </motion.button>
          </>
        )}
      </div>

      {/* Action form for hold/partial_hold */}
      {deposit.status === 'paid' && actionForm && (actionForm.action === 'hold' || actionForm.action === 'partial_hold') && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 space-y-2">
          {actionForm.action === 'partial_hold' && (
            <NumberInput
              value={actionForm.held_amount}
              onChange={(value) => setActionForm((f) => f && { ...f, held_amount: value })}
              min={0}
              step={1000}
              placeholder={t('bookings.deposits.amountToHold')}
              ariaLabel={t('bookings.deposits.amountToHold')}
            />
          )}
          <input
            type="text"
            value={actionForm.reason}
            onChange={(e) => setActionForm((f) => f && { ...f, reason: e.target.value })}
            placeholder={t('common.reason')}
            aria-label={t('common.reason')}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm"
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={handleAction}
              disabled={depAction.isPending}
              className="min-h-[44px] w-full rounded-xl bg-black px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-gray-800 disabled:opacity-50 sm:w-auto"
            >
              {depAction.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : t('common.confirm')}
            </motion.button>
            <button
              type="button"
              onClick={() => setActionForm(null)}
              className="min-h-[44px] w-full rounded-xl border border-gray-200 px-2 text-xs font-bold text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 sm:w-auto sm:border-0"
            >
              {t('common.cancel')}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  )
}

function DepositTableRow({ bookingId, deposit }: { bookingId: string; deposit: BookingDeposit }) {
  const { t } = useTranslation()
  const { symbol } = useCurrency()
  const depAction = useDepositAction(bookingId, deposit.id)
  const [actionForm, setActionForm] = useState<{ action: DepositAction; held_amount: string; reason: string } | null>(null)

  function handleAction() {
    if (!actionForm) return
    const input: DepositActionInput = {
      action: actionForm.action,
      ...(actionForm.action === 'partial_hold' && { held_amount: normalizeNumber(actionForm.held_amount) }),
      ...((actionForm.action === 'hold' || actionForm.action === 'partial_hold') && actionForm.reason && { reason: actionForm.reason }),
    }
    depAction.mutate(input, { onSuccess: () => setActionForm(null) })
  }

  const depositStatusStyle: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-700',
    paid: 'bg-blue-100 text-blue-700',
    returned: 'bg-green-100 text-green-700',
    held: 'bg-red-100 text-red-700',
    partially_held: 'bg-amber-100 text-amber-700',
  }

  return (
    <tr className="align-top border-b border-gray-50">
      <td className="px-4 py-3 text-sm font-semibold text-gray-900">
        {symbol}{formatMoney(deposit.amount)}
      </td>
      <td className="px-4 py-3">
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${depositStatusStyle[deposit.status] || 'bg-gray-100 text-gray-700'}`}>
          {depositStatusLabel(t, deposit.status)}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-600">
        {deposit.held_amount > 0 ? `${symbol}${formatMoney(deposit.held_amount)}` : '-'}
      </td>
      <td className="px-4 py-3 text-xs text-gray-600">{deposit.reason || '-'}</td>
      <td className="px-4 py-3 text-xs text-gray-500">{new Date(deposit.created_at).toLocaleDateString()}</td>
      <td className="px-4 py-3">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {deposit.status === 'pending' && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={() => {
                  setActionForm(null)
                  depAction.mutate({ action: 'pay' })
                }}
                disabled={depAction.isPending}
                className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {t('bookings.deposits.markAsPaid')}
              </motion.button>
            )}
            {deposit.status === 'paid' && (
              <>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => {
                    setActionForm(null)
                    depAction.mutate({ action: 'return' })
                  }}
                  disabled={depAction.isPending}
                  className="rounded-lg bg-green-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                >
                  {t('bookings.deposits.return')}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => setActionForm({ action: 'hold', held_amount: '', reason: '' })}
                  aria-label={t('bookings.deposits.hold')}
                  className="rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-red-700"
                >
                  {t('bookings.deposits.hold')}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={() => setActionForm({ action: 'partial_hold', held_amount: '', reason: '' })}
                  aria-label="Partial"
                  className="rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-amber-700"
                >
                  {t('bookings.deposits.partiallyHold')}
                </motion.button>
              </>
            )}
          </div>
          {deposit.status === 'paid' && actionForm && (actionForm.action === 'hold' || actionForm.action === 'partial_hold') && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
              {actionForm.action === 'partial_hold' && (
                <NumberInput
                  value={actionForm.held_amount}
                  onChange={(value) => setActionForm((f) => f && { ...f, held_amount: value })}
                  min={0}
                  step={1000}
                  placeholder={t('bookings.deposits.amountToHold')}
                  ariaLabel={t('bookings.deposits.amountToHold')}
                />
              )}
              <input
                type="text"
                value={actionForm.reason}
                onChange={(e) => setActionForm((f) => f && { ...f, reason: e.target.value })}
                placeholder={t('common.reason')}
                aria-label={t('common.reason')}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs outline-none focus:ring-2 focus:ring-black/10"
              />
              <div className="flex flex-wrap gap-2">
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={handleAction}
                  disabled={depAction.isPending}
                  className="rounded-lg bg-black px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
                >
                  {depAction.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t('common.confirm')}
                </motion.button>
                <button
                  type="button"
                  onClick={() => setActionForm(null)}
                  className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </td>
    </tr>
  )
}

// --- Files & Comments Tab ---
function FilesCommentsTab({ bookingId, files, comments }: { bookingId: string; files: BookingFile[]; comments: BookingComment[] }) {
  const { t } = useTranslation()
  const uploadFile = useUploadBookingFile(bookingId)
  const deleteFile = useDeleteBookingFile(bookingId)
  const addComment = useAddComment(bookingId)
  const [commentText, setCommentText] = useState('')

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile.mutate(file)
  }

  function handleComment() {
    if (!commentText.trim()) return
    addComment.mutate(
      { content: commentText },
      { onSuccess: () => setCommentText('') },
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Files */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-400" /> {t('bookings.files.files')}
          </h2>
          <label className="flex items-center gap-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold text-gray-700 cursor-pointer transition-colors">
            <Plus className="w-3 h-3" /> {t('bookings.files.upload')}
            <input type="file" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
        {uploadFile.isPending && (
          <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
            <Loader2 className="w-3 h-3 animate-spin" /> {t('bookings.files.uploading')}
          </div>
        )}
        {files.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">{t('bookings.files.noFiles')}</p>
        ) : (
          <div className="space-y-2">
            {files.map((f) => (
              <div key={f.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-700 truncate">{f.file_name}</span>
                <div className="flex gap-1">
                  <a
                    href={apiUrl(`/bookings/${bookingId}/files/${f.id}/download`)}
                    download={f.file_name}
                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-gray-500" />
                  </a>
                  <button
                    onClick={() => deleteFile.mutate(f.id)}
                    className="p-1 hover:bg-red-50 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comments */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
          <MessageSquare className="w-4 h-4 text-gray-400" /> {t('bookings.files.comments')}
        </h2>
        <div className="space-y-3 mb-4 max-h-80 overflow-y-auto">
          {comments.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">{t('bookings.files.noComments')}</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-sm text-gray-800">{c.content}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(c.created_at).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleComment()}
            placeholder={t('bookings.files.addComment')}
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-sm"
          />
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleComment}
            disabled={addComment.isPending || !commentText.trim()}
            className="bg-black text-white hover:bg-gray-800 rounded-xl px-4 py-2 transition-colors disabled:opacity-50"
          >
            {addComment.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </motion.button>
        </div>
      </div>
    </div>
  )
}

// --- History Tab ---
function HistoryTab({ auditLogs }: { auditLogs: BookingAuditLog[] }) {
  const { t } = useTranslation()
  return (
    <AuditTrail entries={auditLogs} title={t('bookings.activityHistory')} />
  )
}

function depositStatusLabel(t: (key: string) => string, status: DepositStatus): string {
  const map: Record<DepositStatus, string> = {
    pending: t('bookings.deposits.status.pending'),
    paid: t('bookings.deposits.status.paid'),
    returned: t('bookings.deposits.status.returned'),
    held: t('bookings.deposits.status.held'),
    partially_held: t('bookings.deposits.status.partiallyHeld'),
  }
  return map[status] ?? status
}

function formatDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
}
