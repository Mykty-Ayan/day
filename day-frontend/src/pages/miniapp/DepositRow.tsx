/**
 * The deposit, as an operator deals with it: take it at check-in, give it back
 * at check-out, or keep some of it when something is broken.
 *
 * The domain allows pending → paid → (returned | held), so the row offers only
 * the step that is legal right now instead of a row of buttons that error.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, Undo2, Wallet } from 'lucide-react'
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
          {deposit.status === 'paid' && (
            <div className="mt-2">
              <ActionButton
                disabled={act.isPending}
                onClick={() => act.mutate({ deposit, action: 'return' })}
              >
                <Undo2 className="h-4 w-4" />
                {t('miniapp.deposit.give_back')}
              </ActionButton>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
