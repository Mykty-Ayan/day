import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Banknote, Check, LogIn, LogOut, MoreHorizontal, Pencil, Undo2, X, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useChangeBookingStatus, useDepositAction } from '../../hooks/useBookings'
import { useCurrency } from '../../hooks/useCurrency'
import { usePropertyPricing } from '../../hooks/useProperties'
import type { bookingMoney } from '../../lib/booking-money'
import { mainStep, stepWarnings } from '../../lib/booking-steps'
import { formatMoney } from '../../pages/miniapp/format'
import type { Booking, BookingDeposit, BookingStatus } from '../../types/booking'
import { Badge } from '../ui/badge'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { showToast } from '../ui/Toast'
import ExtendStayButton from './ExtendStayButton'
import StatusStepDialog from './StatusStepDialog'
import TakePaymentPanel from './TakePaymentPanel'

const NEXT_STEP: Partial<Record<BookingStatus, { target: BookingStatus; labelKey: string; icon: LucideIcon }>> = {
  pending: { target: 'confirmed', labelKey: 'bookings.status.confirm', icon: Check },
  confirmed: { target: 'checked_in', labelKey: 'bookings.status.checkIn', icon: LogIn },
  checked_in: { target: 'checked_out', labelKey: 'bookings.status.checkOut', icon: LogOut },
  checked_out: { target: 'completed', labelKey: 'bookings.status.complete', icon: Check },
}

const SECONDARY =
  'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold text-ink transition-colors hover:bg-surface-page disabled:opacity-50 lg:min-h-[40px]'

/** The next step of the stay, what to know before it, and the rest of what can happen. */
export default function BookingActions({
  booking,
  money,
  deposits,
}: {
  booking: Booking
  money: ReturnType<typeof bookingMoney>
  deposits: BookingDeposit[]
}) {
  const { t, i18n } = useTranslation()
  const { symbol } = useCurrency()
  const navigate = useNavigate()
  const changeStatus = useChangeBookingStatus(booking.id)
  const { data: pricing } = usePropertyPricing(booking.property_id)
  const [menuOpen, setMenuOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [asking, setAsking] = useState(false)
  // The step as it was when pressed: a refetch while the question is open must not
  // turn "yes" into the step after it.
  const [asked, setAsked] = useState<{ target: BookingStatus; label: string; warnings: string[] } | null>(null)
  // Kept after the deposit is back: the dialog must outlive the button to close softly.
  const [returning, setReturning] = useState<BookingDeposit | null>(null)
  const [returnOpen, setReturnOpen] = useState(false)
  const [paying, setPaying] = useState(false)
  const next = NEXT_STEP[booking.status]
  const cancellable = booking.status === 'pending' || booking.status === 'confirmed'
  const usualDeposit = (booking.rental_mode === 'hourly' ? pricing?.hourly_deposit : pricing?.default_deposit) ?? 0
  const warnings = stepWarnings(booking.status, money.owes, deposits, usualDeposit).map((warning) =>
    t(`bookings.steps.${warning}`, { amount: `${formatMoney(money.owes, i18n.language)} ${symbol}` }),
  )
  const main = mainStep(booking.status, money.owes, deposits)
  const paidDeposit = deposits.find((deposit) => deposit.status === 'paid')

  function ask() {
    if (!next) return
    setAsked({ target: next.target, label: t(next.labelKey), warnings })
    setAsking(true)
  }

  return (
    <div className="flex flex-col gap-3">
      {warnings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {warnings.map((warning) => (
            <Badge key={warning} tone="warning">{warning}</Badge>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {main === 'takePayment' && (
          <Button onClick={() => setPaying(true)}>
            <Banknote className="h-4 w-4" aria-hidden="true" />
            {t('today.takePayment')}
          </Button>
        )}
        {main === 'returnDeposit' && paidDeposit && (
          <Button
            onClick={() => {
              setReturning(paidDeposit)
              setReturnOpen(true)
            }}
          >
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            {t('bookings.deposits.returnConfirm')}
          </Button>
        )}
        {next &&
          (main === 'status' ? (
            <Button disabled={changeStatus.isPending} onClick={ask}>
              <next.icon className="h-4 w-4" aria-hidden="true" />
              {t(next.labelKey)}
            </Button>
          ) : (
            <button type="button" disabled={changeStatus.isPending} onClick={ask} className={SECONDARY}>
              <next.icon className="h-3.5 w-3.5" aria-hidden="true" />
              {t(next.labelKey)}
            </button>
          ))}
        <ExtendStayButton booking={booking} className={SECONDARY} />
        <button
          type="button"
          onClick={() => navigate({ to: '/bookings/$bookingId/edit', params: { bookingId: booking.id } })}
          className={SECONDARY}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          {t('common.edit')}
        </button>
        {cancellable && (
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger aria-label={t('bookings.card.moreActions')} className={SECONDARY}>
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto min-w-40 p-1">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setCancelling(true)
                }}
                className="flex min-h-[40px] w-full items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-danger transition-colors hover:bg-danger-soft"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                {t('bookings.status.cancel')}
              </button>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {changeStatus.isError && <p role="alert" className="text-xs text-danger">{t('today.statusFailed')}</p>}
      <ConfirmDialog
        open={cancelling}
        variant="danger"
        title={t('bookings.card.cancelAsk')}
        message={t('bookings.card.cancelWarning')}
        confirmLabel={t('bookings.status.cancel')}
        cancelLabel={t('bookings.card.keepBooking')}
        loading={changeStatus.isPending}
        onCancel={() => setCancelling(false)}
        onConfirm={() => changeStatus.mutate('cancelled', { onSettled: () => setCancelling(false) })}
      />
      {asked && (
        <StatusStepDialog
          target={asked.target}
          label={asked.label}
          warnings={asked.warnings}
          open={asking}
          loading={changeStatus.isPending}
          onCancel={() => setAsking(false)}
          onConfirm={() => changeStatus.mutate(asked.target, { onSettled: () => setAsking(false) })}
        />
      )}
      {returning && (
        <ReturnDepositDialog
          bookingId={booking.id}
          deposit={returning}
          open={returnOpen}
          onClose={() => setReturnOpen(false)}
        />
      )}
      <TakePaymentPanel
        booking={booking}
        stayDebt={money.owes}
        ordersDue={booking.orders_due ?? 0}
        open={paying}
        onClose={() => setPaying(false)}
      />
    </div>
  )
}

function ReturnDepositDialog({
  bookingId,
  deposit,
  open,
  onClose,
}: {
  bookingId: string
  deposit: BookingDeposit
  open: boolean
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { symbol } = useCurrency()
  const action = useDepositAction(bookingId, deposit.id)

  return (
    <ConfirmDialog
      open={open}
      title={t('bookings.deposits.returnAsk', { amount: `${formatMoney(Number(deposit.amount), i18n.language)} ${symbol}` })}
      message={t('bookings.deposits.returnWarning')}
      confirmLabel={t('bookings.deposits.returnConfirm')}
      loading={action.isPending}
      onCancel={onClose}
      onConfirm={() =>
        action.mutate(
          { action: 'return' },
          {
            onSuccess: onClose,
            onError: () => showToast('error', t('bookings.deposits.returnFailed')),
          },
        )
      }
    />
  )
}
