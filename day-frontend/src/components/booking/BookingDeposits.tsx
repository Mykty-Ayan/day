import { useState } from 'react'
import { format } from 'date-fns'
import { Loader2, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCreateDeposit, useDepositAction } from '../../hooks/useBookings'
import { usePropertyPricing } from '../../hooks/useProperties'
import { useCurrency } from '../../hooks/useCurrency'
import { depositStatusKeys } from '../../lib/booking-status'
import { dateLocale } from '../../lib/date-locale'
import { formatMoney } from '../../pages/miniapp/format'
import type { Booking, BookingDeposit, DepositStatus } from '../../types/booking'
import { parseApiDateTime } from '../../utils/date-time'
import { Badge, type BadgeTone } from '../ui/badge'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import NumberInput from '../ui/number-input'
import { showToast } from '../ui/Toast'

const QUICK_AMOUNTS = [5000, 10000, 20000]

const ACTION = 'inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-line px-3 py-2 text-xs font-bold transition-colors hover:bg-surface-page disabled:opacity-50'

const TONES: Record<DepositStatus, BadgeTone> = {
  pending: 'warning',
  paid: 'success',
  returned: 'neutral',
  held: 'danger',
  partially_held: 'warning',
}

const toNumber = (value: string) => Number(value.replace(/\s+/g, '').replace(',', '.')) || 0

/** The deposit of a stay. Nearly always one, so it reads as a line, not a table. */
export default function BookingDeposits({ booking, deposits }: { booking: Booking; deposits: BookingDeposit[] }) {
  const { t } = useTranslation()
  const { data: pricing } = usePropertyPricing(booking.property_id)
  const createDeposit = useCreateDeposit(booking.id)
  const [amount, setAmount] = useState('')
  const [creating, setCreating] = useState(false)
  const usual = booking.rental_mode === 'hourly' ? pricing?.hourly_deposit : pricing?.default_deposit
  // As in the Mini App: a new deposit once the last one is back with the guest.
  const canCreate = deposits.every((deposit) => deposit.status === 'returned')

  function open() {
    setAmount(usual ? String(usual) : '')
    setCreating(true)
  }

  function create() {
    if (toNumber(amount) <= 0) return
    createDeposit.mutate(
      { amount: toNumber(amount) },
      {
        onSuccess: () => setCreating(false),
        onError: () => showToast('error', t('bookings.deposits.actionFailed')),
      },
    )
  }

  return (
    <section id="deposits" className="scroll-mt-4 rounded-2xl border border-line bg-surface-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-ink">{t('bookings.card.deposit')}</h2>
        {canCreate && !creating && (
          <button type="button" onClick={open} className={`${ACTION} text-ink`}>
            <Plus className="h-3 w-3" aria-hidden="true" /> {t('bookings.deposits.createDeposit')}
          </button>
        )}
      </div>

      {creating && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl bg-surface-page p-4">
          <h3 className="text-sm font-bold text-ink">{t('bookings.deposits.newDeposit')}</h3>
          <NumberInput
            value={amount}
            onChange={setAmount}
            min={0}
            step={1000}
            placeholder={t('common.amount')}
            ariaLabel={t('common.amount')}
          />
          <div className="flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((value) => (
              <QuickAmount key={value} value={value} onPick={() => setAmount(String(value))} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={create} disabled={createDeposit.isPending || toNumber(amount) <= 0}>
              {createDeposit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.create')}
            </Button>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {deposits.length === 0 && !creating && <p className="mt-3 text-sm text-ink-muted">{t('bookings.deposits.noDeposits')}</p>}
      {deposits.length > 0 && (
        <div className="mt-4 divide-y divide-line">
          {deposits.map((deposit) => (
            <DepositRow key={deposit.id} bookingId={booking.id} deposit={deposit} />
          ))}
        </div>
      )}
    </section>
  )
}

function QuickAmount({ value, onPick }: { value: number; onPick: () => void }) {
  const { i18n } = useTranslation()
  const { symbol } = useCurrency()
  return (
    <button
      type="button"
      onClick={onPick}
      className="min-h-[36px] whitespace-nowrap rounded-full border border-line bg-surface-card px-3 text-xs font-semibold text-ink transition-colors hover:border-ink"
    >
      {formatMoney(value, i18n.language)} {symbol}
    </button>
  )
}

function DepositRow({ bookingId, deposit }: { bookingId: string; deposit: BookingDeposit }) {
  const { t, i18n } = useTranslation()
  const { symbol } = useCurrency()
  const action = useDepositAction(bookingId, deposit.id)
  const [returning, setReturning] = useState(false)
  const [paying, setPaying] = useState(false)
  const [holding, setHolding] = useState<'all' | 'part' | null>(null)
  const sum = (value: number) => `${formatMoney(value, i18n.language)} ${symbol}`
  const total = Number(deposit.amount)
  const held = Number(deposit.held_amount)

  function pay() {
    action.mutate(
      { action: 'pay' },
      {
        onSuccess: () => setPaying(false),
        onError: () => showToast('error', t('bookings.deposits.actionFailed')),
      },
    )
  }

  function giveBack() {
    action.mutate(
      { action: 'return' },
      {
        onSuccess: () => setReturning(false),
        onError: () => showToast('error', t('bookings.deposits.returnFailed')),
      },
    )
  }

  const created = format(parseApiDateTime(deposit.created_at), i18n.language === 'en' ? 'MMM d' : 'd MMM', {
    locale: dateLocale(i18n.language),
  })
  const note =
    deposit.status === 'held'
      ? t('bookings.deposits.heldAll', { amount: sum(held) })
      : deposit.status === 'partially_held'
        ? t('bookings.deposits.heldPart', { held: sum(held), rest: sum(total - held) })
        : t('bookings.deposits.createdOn', { date: created })

  return (
    <div className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="whitespace-nowrap text-lg font-bold text-ink">{sum(total)}</span>
            <Badge tone={TONES[deposit.status]}>{t(depositStatusKeys[deposit.status])}</Badge>
          </p>
          <p className="mt-1 text-xs text-ink-muted">{note}</p>
          {deposit.reason && (
            <p className="mt-1 text-xs text-ink-muted">{t('bookings.deposits.reasonIs', { reason: deposit.reason })}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {deposit.status === 'pending' && (
            <button type="button" onClick={() => setPaying(true)} disabled={action.isPending} className={`${ACTION} text-ink`}>
              {t('bookings.deposits.markAsPaid')}
            </button>
          )}
          {deposit.status === 'paid' && !holding && (
            <>
              <button type="button" onClick={() => setReturning(true)} disabled={action.isPending} className={`${ACTION} text-ink`}>
                {t('bookings.deposits.return')}
              </button>
              <button type="button" onClick={() => setHolding('part')} className={`${ACTION} text-danger`}>
                {t('bookings.deposits.holdPart')}
              </button>
              <button type="button" onClick={() => setHolding('all')} className={`${ACTION} text-danger`}>
                {t('bookings.deposits.hold')}
              </button>
            </>
          )}
        </div>
      </div>

      {deposit.status === 'paid' && holding && (
        <HoldForm bookingId={bookingId} deposit={deposit} whole={holding === 'all'} onDone={() => setHolding(null)} />
      )}

      <ConfirmDialog
        open={paying}
        title={t('bookings.deposits.markAsPaidAsk', { amount: sum(total) })}
        message={t('bookings.deposits.markAsPaidWarning')}
        confirmLabel={t('bookings.deposits.markAsPaid')}
        loading={action.isPending}
        onCancel={() => setPaying(false)}
        onConfirm={pay}
      />
      <ConfirmDialog
        open={returning}
        title={t('bookings.deposits.returnAsk', { amount: sum(total) })}
        message={t('bookings.deposits.returnWarning')}
        confirmLabel={t('bookings.deposits.returnConfirm')}
        loading={action.isPending}
        onCancel={() => setReturning(false)}
        onConfirm={giveBack}
      />
    </div>
  )
}

/** One form for holding all of a deposit or a part of it: the sum says which. The
 *  button names the sum, and a hold is final. */
function HoldForm({
  bookingId,
  deposit,
  whole,
  onDone,
}: {
  bookingId: string
  deposit: BookingDeposit
  whole: boolean
  onDone: () => void
}) {
  const { t, i18n } = useTranslation()
  const { symbol } = useCurrency()
  const action = useDepositAction(bookingId, deposit.id)
  const total = Number(deposit.amount)
  const [amount, setAmount] = useState(whole ? String(total) : '')
  const [reason, setReason] = useState('')
  const sum = (value: number) => `${formatMoney(value, i18n.language)} ${symbol}`
  const held = toNumber(amount)
  const valid = held > 0 && held <= total

  function hold() {
    const note = reason.trim() ? { reason: reason.trim() } : {}
    action.mutate(held === total ? { action: 'hold', ...note } : { action: 'partial_hold', held_amount: held, ...note }, {
      onSuccess: onDone,
      onError: () => showToast('error', t('bookings.deposits.actionFailed')),
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface-page p-4">
      <label className="flex flex-col gap-1 text-xs font-semibold text-ink-muted">
        {t('bookings.deposits.amountToHold')}
        <NumberInput value={amount} onChange={setAmount} min={0} max={total} step={1000} ariaLabel={t('bookings.deposits.amountToHold')} />
      </label>
      <input
        type="text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={t('common.reason')}
        aria-label={t('common.reason')}
        className="min-h-[44px] w-full rounded-xl border border-line bg-surface-card px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-accent/30"
      />
      {valid && (
        <p className="text-xs text-ink-muted">
          {held === total ? t('bookings.deposits.holdAllHint') : t('bookings.deposits.holdPartHint', { rest: sum(total - held) })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={hold} disabled={!valid || action.isPending} nowrap>
          {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('bookings.deposits.holdConfirm', { amount: sum(valid ? held : total) })}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  )
}
