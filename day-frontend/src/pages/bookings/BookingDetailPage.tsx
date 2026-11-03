import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18next from 'i18next'
import { format } from 'date-fns'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Plus,
  Loader2,
} from 'lucide-react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useIsMutating } from '@tanstack/react-query'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Spinner from '../../components/ui/Spinner'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { bookingMoney } from '../../lib/booking-money'
import { depositStatusKeys } from '../../lib/booking-status'
import { Badge, type BadgeTone } from '../../components/ui/badge'
import Button from '../../components/ui/Button'
import {
  useBooking,
  useAddPayment,
  useConfirmPayment,
} from '../../hooks/useBookings'
import type {
  BookingPayment,
  PaymentInput,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '../../types/booking'
import BookingDeposits from '../../components/booking/BookingDeposits'
import BookingFiles from '../../components/booking/BookingFiles'
import BookingGuestCard from '../../components/booking/BookingGuestCard'
import BookingMoneyCard from '../../components/booking/BookingMoneyCard'
import BookingTimeline from '../../components/booking/BookingTimeline'
import StayCard from '../../components/booking/StayCard'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import NumberInput from '../../components/ui/number-input'
import { useCurrency } from '../../hooks/useCurrency'
import { parseApiDateTime } from '../../utils/date-time'
import { dateLocale } from '../../lib/date-locale'
import { intlLocale } from '../miniapp/format'

/** One booking's screen per booking: going to another one, or back, starts it
 *  afresh, so a dialog or an upload begun on one never acts on the next. */
export default function BookingDetailPage() {
  const { bookingId } = useParams({ strict: false }) as { bookingId: string }
  return <BookingScreen key={bookingId} bookingId={bookingId} />
}

function BookingScreen({ bookingId }: { bookingId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: detail, isLoading } = useBooking(bookingId)
  const { symbol } = useCurrency()
  // A table from 1024px wide, cards on a phone: a wide table would scroll sideways.
  const compact = useMediaQuery('(max-width: 1023px)')
  // Each press opens the refund form anew, with the sum the guest is owed; not while a
  // payment is on its way: the new form would forget it and take it again.
  const [refund, setRefund] = useState({ amount: 0, round: 0 })
  const refunding = useIsMutating({ mutationKey: ['add-payment', bookingId] })

  const from = useMemo(() => {
    if (typeof window === 'undefined') return ''
    const params = new URLSearchParams(window.location.search)
    return params.get('from') || ''
  }, [])
  const isFromGantt = from === 'gantt'

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
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <p className="text-sm text-gray-500">{t('bookings.notFound')}</p>
        <Button variant="secondary" onClick={() => navigate({ to: '/bookings' })}>
          {t('bookings.backToBookings')}
        </Button>
      </div>
    )
  }

  const { booking, guest } = detail
  const money = bookingMoney(booking.status, normalizeNumber(booking.total_price), detail.payments)
  // The detail call brings no paid sum: the panels read it from here.
  const stay = { ...booking, paid_amount: money.paid }

  function startRefund() {
    setRefund({ amount: money.toReturn, round: refund.round + 1 })
    document.getElementById('payments')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-6xl mx-auto w-full">
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

        <div className="flex flex-col gap-5">
          <StayCard booking={stay} money={money} deposits={detail.deposits} />
          {/* On a phone: the money right under the stay, the guest and the history last.
              On a wide screen the money and the rest share the right column. */}
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[auto_1fr]">
            <div className="lg:col-start-2 lg:row-start-1">
              <BookingMoneyCard
                booking={stay}
                money={money}
                deposits={detail.deposits}
                depositLabel={(deposit) =>
                  `${formatMoneyChip(deposit.amount)} ${symbol} · ${t(depositStatusKeys[deposit.status])}`
                }
                onRefund={startRefund}
                refunding={refunding > 0}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <PaymentsTab
                key={refund.round}
                refundAmount={refund.amount}
                bookingId={bookingId}
                payments={detail.payments}
                money={money}
                compact={compact}
              />
              <BookingDeposits booking={booking} deposits={detail.deposits} />
              <BookingFiles bookingId={bookingId} files={detail.files} />
            </div>
            <aside className="flex flex-col gap-5 lg:col-start-2 lg:row-start-2">
              <BookingGuestCard booking={booking} guest={guest} stays={detail.guest_stays} />
              <BookingTimeline
                bookingId={bookingId}
                logs={detail.audit_logs}
                payments={detail.payments}
                comments={detail.comments}
                people={detail.people}
              />
            </aside>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// The cabinet's language, not the browser's: a Russian screen in an English browser
// wrote «20,000 ₸» and «11/3/2026».
const moneyFormat = (digits: number) =>
  new Intl.NumberFormat(intlLocale(i18next.language), { maximumFractionDigits: digits })

/** To the minute: two payments of one day are told apart by the time. */
function paidAt(value: string): string {
  return format(parseApiDateTime(value), i18next.language === 'en' ? 'MMM d, HH:mm' : 'd MMM, HH:mm', {
    locale: dateLocale(i18next.language),
  })
}

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
  return moneyFormat(2).format(normalizeNumber(value))
}

function formatMoneyChip(value: number | string | null | undefined): string {
  return moneyFormat(0).format(normalizeNumber(value))
}

// --- Payments Tab ---
const PAYMENT_TONES: Record<PaymentStatus, BadgeTone> = { pending: 'neutral', completed: 'success', failed: 'danger' }

function PaymentsTab({
  bookingId,
  payments,
  money,
  compact,
  refundAmount,
}: {
  bookingId: string
  payments: BookingPayment[]
  money: ReturnType<typeof bookingMoney>
  compact: boolean
  refundAmount: number
}) {
  const { t } = useTranslation()
  const { symbol } = useCurrency()
  const addPayment = useAddPayment(bookingId)
  const paying = useIsMutating({ mutationKey: ['add-payment', bookingId] }) > 0
  const confirmPayment = useConfirmPayment(bookingId)
  const [showForm, setShowForm] = useState(refundAmount > 0)
  const [toConfirm, setToConfirm] = useState<BookingPayment | null>(null)
  const [form, setForm] = useState({
    amount: refundAmount > 0 ? String(refundAmount) : '',
    method: 'cash' as PaymentMethod,
    note: '',
  })
  const amountStep = 1000

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

  const refundableAmount = Math.max(0, money.paid)
  const quickOptionsRaw = [
    ...(money.toReturn > 0 ? [{ label: t('bookings.payments.overpaid'), value: money.toReturn }] : []),
    { label: t('common.total'), value: refundableAmount },
    { label: '50%', value: refundableAmount * 0.5 },
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
      { amount, type: 'refund', method: form.method, note: form.note || undefined } as PaymentInput,
      {
        onSuccess: () => {
          setForm({ amount: '', method: 'cash', note: '' })
          setShowForm(false)
        },
      },
    )
  }

  return (
    <section id="payments" className="space-y-3 rounded-2xl border border-line bg-surface-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-ink">{t('bookings.tabs.payments')}</h2>
        {money.paid > 0 && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowForm(true)}
            className="flex min-h-[40px] items-center justify-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-bold text-ink transition-colors hover:bg-surface-page"
          >
            <Plus className="w-3 h-3" /> {t('bookings.payments.addRefund')}
          </motion.button>
        )}
      </div>

      {/* Refund form */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="rounded-2xl border border-line bg-surface-card p-5"
        >
          <h3 className="text-sm font-bold text-gray-900 mb-3">{t('bookings.payments.addRefund')}</h3>
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
                  key={`${option.label}-${option.value}`}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, amount: String(option.value) }))}
                  className="px-3 py-1.5 rounded-full border border-gray-200 bg-white hover:bg-gray-900 hover:text-white text-xs font-semibold text-gray-700 transition-all"
                >
                  {option.label} ({formatMoneyChip(option.value)} {symbol})
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row">
            <motion.button
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={handleSubmit}
              disabled={paying}
              aria-label="Save"
              className="min-h-[44px] w-full rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-accent-hover disabled:opacity-50 sm:w-auto"
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
        <p className="text-sm text-ink-muted">{t('bookings.payments.noPayments')}</p>
      ) : compact ? (
        <div className="space-y-3">
          {payments.map((payment) => (
            <div key={payment.id} className="rounded-xl border border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {payment.type === 'refund' ? '-' : ''}{formatMoney(Math.abs(normalizeNumber(payment.amount)))} {symbol}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {paymentTypeLabels[payment.type]} · {paymentMethodLabels[payment.method]}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={PAYMENT_TONES[payment.status]}>{paymentStatusLabels[payment.status]}</Badge>
                  {payment.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => setToConfirm(payment)}
                      disabled={confirmPayment.isPending}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
                    >
                      {t('bookings.payments.confirm')}
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-1 text-xs text-gray-600 sm:grid-cols-2">
                <span>{paidAt(payment.paid_at || payment.created_at)}</span>
                {payment.note && <span className="sm:text-right">{payment.note}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden">
          <div className="w-full overflow-x-auto">
            <table className="w-full">
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
                      {p.type === 'refund' ? '-' : ''}{formatMoney(Math.abs(normalizeNumber(p.amount)))} {symbol}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{paymentTypeLabels[p.type]}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{paymentMethodLabels[p.method]}</td>
                    <td className="px-4 py-3">
                      <Badge tone={PAYMENT_TONES[p.status]}>{paymentStatusLabels[p.status]}</Badge>
                      {p.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => setToConfirm(p)}
                          disabled={confirmPayment.isPending}
                          className="ml-2 text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        >
                          {t('bookings.payments.confirm')}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {paidAt(p.paid_at || p.created_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{p.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={toConfirm !== null}
        title={t('bookings.payments.confirmAsk', { amount: `${formatMoney(Math.abs(normalizeNumber(toConfirm?.amount)))} ${symbol}` })}
        message={t('bookings.payments.confirmWarning')}
        confirmLabel={t('bookings.payments.confirm')}
        loading={confirmPayment.isPending}
        onCancel={() => setToConfirm(null)}
        onConfirm={() => toConfirm && confirmPayment.mutate(toConfirm.id, { onSettled: () => setToConfirm(null) })}
      />
    </section>
  )
}
