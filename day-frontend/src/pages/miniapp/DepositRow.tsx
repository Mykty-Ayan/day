/**
 * The deposit, as an operator deals with it: take it at check-in, give it back
 * at check-out, or keep some of it when something is broken.
 *
 * The domain allows pending → paid → (returned | held), so the row offers only
 * the step that is legal right now instead of a row of buttons that error.
 */

import { useState } from 'react'
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HandCoins, ShieldCheck, Undo2, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { createDeposit, depositAction, listDeposits } from '../../api/bookings'
import type { BookingDeposit } from '../../types/booking'
import { resultFeedback } from '../../lib/telegram'
import { cardRead, readyToAct } from './card-state'
import { formatMoney } from './format'
import { ActionButton, Field } from './miniapp-ui'

export default function DepositRow({
  bookingId,
  suggestedAmount,
  onError,
  locked = false,
}: {
  bookingId: string
  suggestedAmount: number
  onError: (error: unknown) => void
  /** The card has not reread the booking yet: no money moves on old figures. */
  locked?: boolean
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  // Keeping money needs a number and a reason, so the form only appears once
  // the operator says they intend to keep some.
  const [holdingFor, setHoldingFor] = useState<string | null>(null)
  const [heldAmount, setHeldAmount] = useState('')
  const [reason, setReason] = useState('')

  // Read again on every open: a deposit taken a minute ago by the CRM or another
  // phone must show, or "Take deposit" takes a second one.
  const [openedAt] = useState(() => Date.now())
  const deposits = useQuery({
    ...cardRead(['miniapp', 'deposits', bookingId], (signal) => listDeposits(bookingId, signal)),
    enabled: Boolean(bookingId),
  })
  // A write started by an earlier card (closed before its answer) still counts:
  // a reread can come back empty before that deposit is committed.
  const writeKey = ['miniapp', 'deposit-write', bookingId]
  const writing = useIsMutating({ mutationKey: writeKey }) > 0
  const blocked = locked || writing || !readyToAct(deposits, openedAt)

  function refresh() {
    resultFeedback('success')
    queryClient.invalidateQueries({ queryKey: ['miniapp', 'deposits', bookingId] })
  }

  // The server takes it only while no deposit is open: a press after a lost
  // answer, or from a second phone, gets 409 instead of a second deposit.
  const take = useMutation({
    mutationKey: writeKey,
    mutationFn: () => createDeposit(bookingId, { amount: Number(amount || suggestedAmount), unless_open: true }),
    onSuccess: () => {
      setAmount('')
      refresh()
    },
    onError: (error) => {
      // A lost answer may hide a deposit already made: reread before another "Take".
      queryClient.invalidateQueries({ queryKey: ['miniapp', 'deposits', bookingId] })
      onError(error)
    },
  })

  const act = useMutation({
    mutationKey: writeKey,
    mutationFn: ({ deposit, action }: { deposit: BookingDeposit; action: 'pay' | 'return' }) =>
      depositAction(bookingId, deposit.id, { action }),
    onSuccess: refresh,
    onError,
  })

  const hold = useMutation({
    mutationKey: writeKey,
    mutationFn: (deposit: BookingDeposit) => {
      const kept = Number(heldAmount || deposit.amount)
      // Keeping the whole thing is its own action; the partial one refuses an
      // amount equal to the deposit only by accident of naming, so be explicit.
      const whole = kept >= deposit.amount
      return depositAction(bookingId, deposit.id, {
        action: whole ? 'hold' : 'partial_hold',
        held_amount: whole ? undefined : kept,
        reason: reason.trim() || undefined,
      })
    },
    onSuccess: () => {
      setHoldingFor(null)
      setHeldAmount('')
      setReason('')
      refresh()
    },
    onError,
  })

  const open = (deposits.data ?? []).filter((deposit) => deposit.status !== 'returned')

  if (open.length === 0) {
    return (
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <Field
          label={t('miniapp.deposit.title')}
          value={amount}
          onChange={setAmount}
          type="number"
          inputMode="numeric"
          placeholder={String(suggestedAmount)}
        />
        <ActionButton disabled={blocked || take.isPending} onClick={() => take.mutate()}>
          <ShieldCheck className="h-4 w-4" />
          {t('miniapp.deposit.take')}
        </ActionButton>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {open.map((deposit) => (
        <div key={deposit.id} className="tg-surface rounded-xl px-3 py-2.5">
          <p className="flex items-baseline justify-between text-sm">
            <span className="tg-hint">{t(`miniapp.deposit.status.${deposit.status}`)}</span>
            <span className="font-bold">{formatMoney(deposit.amount, i18n.language)} ₸</span>
          </p>
          {deposit.held_amount > 0 && (
            <p className="tg-hint mt-1 text-xs">
              {t('miniapp.deposit.held', {
                amount: formatMoney(deposit.held_amount, i18n.language),
              })}
            </p>
          )}
          {/* Only pending and paid lead anywhere: once money is held the
              domain has no further step, so the row just states where it is.
              Deciding how much to keep needs a reason and belongs on a desk. */}
          {deposit.status === 'pending' && (
            <div className="mt-2">
              <ActionButton
                disabled={blocked || act.isPending}
                onClick={() => act.mutate({ deposit, action: 'pay' })}
              >
                <Wallet className="h-4 w-4" />
                {t('miniapp.deposit.received')}
              </ActionButton>
            </div>
          )}
          {deposit.status === 'paid' && holdingFor !== deposit.id && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ActionButton
                disabled={blocked || act.isPending}
                onClick={() => act.mutate({ deposit, action: 'return' })}
              >
                <Undo2 className="h-4 w-4" />
                {t('miniapp.deposit.give_back')}
              </ActionButton>
              <ActionButton
                disabled={blocked}
                onClick={() => {
                  setHoldingFor(deposit.id)
                  setHeldAmount(String(deposit.amount))
                  setReason('')
                }}
              >
                <HandCoins className="h-4 w-4" />
                {t('miniapp.deposit.keep')}
              </ActionButton>
            </div>
          )}

          {deposit.status === 'paid' && holdingFor === deposit.id && (
            <div className="mt-2 space-y-2">
              <Field
                label={t('miniapp.deposit.keepAmount')}
                value={heldAmount}
                onChange={setHeldAmount}
                type="number"
                inputMode="numeric"
                placeholder={String(deposit.amount)}
              />
              <Field
                label={t('miniapp.deposit.reason')}
                value={reason}
                onChange={setReason}
                placeholder={t('miniapp.deposit.reasonPlaceholder')}
              />
              <div className="grid grid-cols-2 gap-2">
                <ActionButton onClick={() => setHoldingFor(null)}>
                  {t('miniapp.deposit.cancel')}
                </ActionButton>
                <ActionButton
                  tone="primary"
                  disabled={blocked || hold.isPending || Number(heldAmount) <= 0}
                  onClick={() => hold.mutate(deposit)}
                >
                  <HandCoins className="h-4 w-4" />
                  {t('miniapp.deposit.keep')}
                </ActionButton>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
