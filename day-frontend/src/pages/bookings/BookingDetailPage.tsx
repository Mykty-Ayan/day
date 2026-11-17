import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18next from 'i18next'
import { format } from 'date-fns'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowLeftRight, Banknote, CreditCard, Undo2, type LucideIcon } from 'lucide-react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useIsMutating } from '@tanstack/react-query'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Spinner from '../../components/ui/Spinner'
import { bookingMoney } from '../../lib/booking-money'
import { depositStatusKeys } from '../../lib/booking-status'
import { Badge, type BadgeTone } from '../../components/ui/badge'
import Button from '../../components/ui/Button'
import { useBooking, useConfirmPayment } from '../../hooks/useBookings'
import type { BookingPayment, PaymentMethod, PaymentStatus } from '../../types/booking'
import BookingDeposits from '../../components/booking/BookingDeposits'
import BookingBlocks from '../../components/booking/BookingBlocks'
import BookingFiles from '../../components/booking/BookingFiles'
import BookingGuestCard from '../../components/booking/BookingGuestCard'
import BookingMoneyCard from '../../components/booking/BookingMoneyCard'
import BookingTimeline from '../../components/booking/BookingTimeline'
import RefundPanel from '../../components/booking/RefundPanel'
import StayCard from '../../components/booking/StayCard'
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
  // The refund panel opens anew each time, with the sum due back; not while a payment
  // is on its way: the new form would forget it and take it again.
  const [refundOpen, setRefundOpen] = useState(false)
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
        <p className="text-sm text-ink-muted">{t('bookings.notFound')}</p>
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
          className="mb-4 inline-flex items-center gap-1 text-xs font-bold text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
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
                onRefund={() => setRefundOpen(true)}
                refunding={refunding > 0}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <PaymentsTab
                bookingId={bookingId}
                payments={detail.payments}
                money={money}
                onRefund={() => setRefundOpen(true)}
                refunding={refunding > 0}
              />
              <BookingDeposits booking={booking} deposits={detail.deposits} />
              <BookingFiles bookingId={bookingId} files={detail.files} />
            </div>
            <aside className="flex flex-col gap-5 lg:col-start-2 lg:row-start-2">
              <section className="rounded-2xl border border-line bg-surface-card p-5">
                <h2 className="mb-1 text-sm font-bold text-ink">{t('bookings.blocksTitle')}</h2>
                <BookingBlocks booking={booking} hide={['dates']} />
              </section>
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
        <RefundPanel booking={stay} money={money} open={refundOpen} onClose={() => setRefundOpen(false)} />
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

// --- Payments ---
const PAYMENT_TONES: Record<PaymentStatus, BadgeTone> = { pending: 'neutral', completed: 'success', failed: 'danger' }
const METHOD_ICONS: Record<PaymentMethod, LucideIcon> = { cash: Banknote, card: CreditCard, transfer: ArrowLeftRight }

/** Every payment and refund, newest first as the server sends them: one list on a phone and a desk. */
function PaymentsTab({
  bookingId,
  payments,
  money,
  onRefund,
  refunding,
}: {
  bookingId: string
  payments: BookingPayment[]
  money: ReturnType<typeof bookingMoney>
  onRefund: () => void
  refunding: boolean
}) {
  const { t } = useTranslation()
  const { symbol } = useCurrency()
  const confirmPayment = useConfirmPayment(bookingId)
  const [toConfirm, setToConfirm] = useState<BookingPayment | null>(null)
  const methods: Record<PaymentMethod, string> = {
    cash: t('common.cash'),
    card: t('common.card'),
    transfer: t('common.transfer'),
  }

  return (
    <section id="payments" className="rounded-2xl border border-line bg-surface-card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-ink">{t('bookings.tabs.payments')}</h2>
        {money.paid > 0 && (
          <button
            type="button"
            onClick={onRefund}
            disabled={refunding}
            className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-bold text-ink transition-colors hover:bg-surface-page disabled:opacity-50"
          >
            <Undo2 className="h-3 w-3" aria-hidden="true" /> {t('bookings.payments.addRefund')}
          </button>
        )}
      </div>

      {payments.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('bookings.payments.noPayments')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {payments.map((payment) => {
            const refund = payment.type === 'refund'
            const Icon = refund ? Undo2 : METHOD_ICONS[payment.method]
            return (
              <li key={payment.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${refund ? 'bg-warning-soft text-warning' : 'bg-surface-page text-ink-muted'}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold tabular-nums text-ink">
                    {refund ? '-' : ''}
                    {formatMoney(Math.abs(normalizeNumber(payment.amount)))} {symbol}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {refund ? `${t('bookings.payments.refund')} · ` : ''}
                    {methods[payment.method]} · {paidAt(payment.paid_at || payment.created_at)}
                  </p>
                  {payment.note && <p className="mt-0.5 text-xs text-ink">{payment.note}</p>}
                </div>
                {/* Only what still needs a look: a completed payment is the usual case. */}
                {payment.status !== 'completed' && (
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge tone={PAYMENT_TONES[payment.status]}>{t(`bookings.payments.paymentStatus.${payment.status}`)}</Badge>
                    {payment.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => setToConfirm(payment)}
                        disabled={confirmPayment.isPending}
                        className="text-xs font-semibold text-accent-ink hover:underline disabled:opacity-50"
                      >
                        {t('bookings.payments.confirm')}
                      </button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
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
