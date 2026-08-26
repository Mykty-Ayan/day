/**
 * The deposit, as an operator deals with it: take it at check-in, give it back
 * at check-out, or keep some of it when something is broken.
 *
 * The domain allows pending → paid → (returned | held), so the row offers only
 * the step that is legal right now instead of a row of buttons that error.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HandCoins, ShieldCheck, Undo2, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { createDeposit, depositAction, listDeposits } from '../../api/bookings'
import type { BookingDeposit } from '../../types/booking'
import { resultFeedback } from '../../lib/telegram'
import { formatMoney } from './format'
import { ActionButton, Field } from './miniapp-ui'

export default function DepositRow({
  bookingId,
  suggestedAmount,
  onError,
}: {
  bookingId: string
  suggestedAmount: number
  onError: (error: unknown) => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  // Keeping money needs a number and a reason, so the form only appears once
  // the operator says they intend to keep some.
  const [holdingFor, setHoldingFor] = useState<string | null>(null)
  const [heldAmount, setHeldAmount] = useState('')
  const [reason, setReason] = useState('')

  const deposits = useQuery({
    queryKey: ['miniapp', 'deposits', bookingId],
    queryFn: () => listDeposits(bookingId),
    enabled: Boolean(bookingId),
  })

  function refresh() {
    resultFeedback('success')
    queryClient.invalidateQueries({ queryKey: ['miniapp', 'deposits', bookingId] })
  }

  const take = useMutation({
    mutationFn: () => createDeposit(bookingId, { amount: Number(amount || suggestedAmount) }),
    onSuccess: () => {
      setAmount('')
      refresh()
    },
    onError,
  })

  const act = useMutation({
    mutationFn: ({ deposit, action }: { deposit: BookingDeposit; action: 'pay' | 'return' }) =>
      depositAction(bookingId, deposit.id, { action }),
    onSuccess: refresh,
    onError,
  })

  const hold = useMutation({
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
        <ActionButton disabled={take.isPending} onClick={() => take.mutate()}>
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
                disabled={act.isPending}
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
                disabled={act.isPending}
                onClick={() => act.mutate({ deposit, action: 'return' })}
              >
                <Undo2 className="h-4 w-4" />
                {t('miniapp.deposit.give_back')}
              </ActionButton>
              <ActionButton
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
                  disabled={hold.isPending || Number(heldAmount) <= 0}
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
