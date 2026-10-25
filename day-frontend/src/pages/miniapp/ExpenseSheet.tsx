/**
 * Record what was spent, from the phone: the cleaner paid, the internet bill.
 * The rules are the web form's (`lib/expenses`); an agent's commission needs
 * the agent and the booking, so it stays on the web.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { createExpense } from '../../api/expenses'
import { listAllProperties } from '../../api/properties'
import {
  EXPENSE_CATEGORIES,
  emptyExpenseForm,
  expenseAmount,
  expenseFormError,
  type ExpenseForm,
} from '../../lib/expenses'
import { resultFeedback } from '../../lib/telegram'
import { errorText } from './errors'
import { toISODate } from './format'
import { ActionButton, Field, Sheet } from './miniapp-ui'

const PHONE_CATEGORIES = EXPENSE_CATEGORIES.filter((category) => category !== 'agent_commission')
const selectClass = 'tg-surface min-h-[44px] w-full rounded-xl px-3 text-sm outline-none'

export default function ExpenseSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ExpenseForm>(() => emptyExpenseForm(toISODate(new Date())))
  const [error, setError] = useState('')

  const flats = useQuery({ queryKey: ['miniapp', 'units'], queryFn: () => listAllProperties() })

  const save = useMutation({
    mutationFn: () =>
      createExpense({
        category: form.category,
        amount: expenseAmount(form.amount),
        spent_on: form.spent_on,
        property_id: form.property_id || null,
        payee: form.payee.trim() || null,
        note: form.note.trim() || null,
        agent_id: null,
        booking_id: null,
      }),
    onSuccess: () => {
      resultFeedback('success')
      queryClient.invalidateQueries({ queryKey: ['miniapp'] })
      onClose()
    },
    onError: (mutationError) => {
      resultFeedback('error')
      setError(errorText(mutationError, t('expenses.failed'), t))
    },
  })

  const change = (field: keyof ExpenseForm) => (value: string) => {
    setError('')
    setForm((current) => ({ ...current, [field]: value }))
  }

  function submit() {
    const problem = expenseFormError(form)
    if (problem) setError(t(problem))
    else save.mutate()
  }

  return (
    <Sheet open title={t('expenses.add')} onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="tg-hint mb-1 block text-xs font-bold uppercase tracking-wide">{t('expenses.category')}</span>
          <select
            value={form.category}
            onChange={(event) => change('category')(event.target.value)}
            className={selectClass}
          >
            {PHONE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {t(`expenses.categories.${category}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('expenses.amount')} inputMode="decimal" value={form.amount} onChange={change('amount')} />
          <Field label={t('expenses.day')} type="date" value={form.spent_on} onChange={change('spent_on')} />
        </div>
        <label className="block">
          <span className="tg-hint mb-1 block text-xs font-bold uppercase tracking-wide">{t('expenses.flat')}</span>
          <select
            value={form.property_id}
            onChange={(event) => change('property_id')(event.target.value)}
            className={selectClass}
          >
            <option value="">{t('expenses.flatNone')}</option>
            {(flats.data?.items ?? [])
              .filter((flat) => flat.status !== 'archived')
              .map((flat) => (
                <option key={flat.id} value={flat.id}>
                  {flat.name || flat.internal_name}
                </option>
              ))}
          </select>
        </label>
        <Field label={t('expenses.payee')} value={form.payee} onChange={change('payee')} />
        <Field label={t('expenses.note')} value={form.note} onChange={change('note')} />

        {error && (
          <p role="alert" className="text-sm font-semibold">
            {error}
          </p>
        )}
        <ActionButton tone="primary" disabled={save.isPending} onClick={submit}>
          {save.isPending ? t('miniapp.loading') : t('expenses.save')}
        </ActionButton>
      </div>
    </Sheet>
  )
}
