import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, Plus } from 'lucide-react'
import { showToast } from '../../components/ui/Toast'
import { useCurrentUser } from '../../hooks/useAuth'
import { useCurrency } from '../../hooks/useCurrency'
import { useCreateExpense, useExpenses, useVoidExpense } from '../../hooks/useExpenses'
import { useAllProperties } from '../../hooks/useProperties'
import {
  EXPENSE_CATEGORIES,
  emptyExpenseForm,
  expenseAmount,
  expenseFormError,
  monthPeriod,
  type ExpenseCategory,
  type ExpenseForm,
} from '../../lib/expenses'

const field =
  'w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-black/10'
const label = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-400'

/** Today on this device's calendar, as YYYY-MM-DD. */
function localToday(): string {
  return new Date().toLocaleDateString('sv-SE')
}

export default function ExpensesPage() {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const isOwner = user?.role === 'owner'
  const { format } = useCurrency()
  const today = localToday()
  const [month, setMonth] = useState(today.slice(0, 7))
  const period = monthPeriod(month)
  const { data: expenses = [], isLoading } = useExpenses(period, isOwner)
  const { data: allFlats } = useAllProperties()
  const createExpense = useCreateExpense()
  const voidExpense = useVoidExpense()
  const [form, setForm] = useState<ExpenseForm>(() => emptyExpenseForm(today))
  const [formError, setFormError] = useState<string | null>(null)

  // Rent may be paid for a flat on pause too; an archived one is gone.
  const flats = useMemo(() => (allFlats?.items ?? []).filter((p) => p.status !== 'archived'), [allFlats])
  const flatName = useMemo(() => new Map((allFlats?.items ?? []).map((p) => [p.id, p.internal_name || p.name])), [allFlats])
  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0)

  if (!isOwner) {
    return <p className="p-6 text-sm text-gray-600">{t('expenses.ownerOnly')}</p>
  }

  function update<K extends keyof ExpenseForm>(key: K, value: ExpenseForm[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setFormError(null)
  }

  async function submit() {
    const error = expenseFormError(form)
    if (error) {
      setFormError(t(error))
      return
    }
    try {
      await createExpense.mutateAsync({
        category: form.category,
        amount: expenseAmount(form.amount),
        spent_on: form.spent_on,
        property_id: form.property_id || null,
        payee: form.payee.trim() || null,
        note: form.note.trim() || null,
      })
      showToast('success', t('expenses.saved'))
      setForm(emptyExpenseForm(form.spent_on))
    } catch {
      showToast('error', t('expenses.failed'))
    }
  }

  async function cancelExpense(id: string) {
    // Money: a voided expense leaves the books' totals, so ask first.
    if (!window.confirm(t('expenses.voidConfirm'))) return
    try {
      await voidExpense.mutateAsync(id)
      showToast('success', t('expenses.voided'))
    } catch {
      showToast('error', t('expenses.failed'))
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">{t('expenses.title')}</h1>
        <label className="text-xs font-bold uppercase tracking-wider text-gray-400">
          {t('expenses.month')}
          <input
            id="expenses-month"
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className={`mt-1.5 ${field}`}
          />
        </label>
      </div>

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900">{t('expenses.add')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className={label}>
            {t('expenses.category')}
            <select
              id="expense-category"
              value={form.category}
              onChange={(e) => update('category', e.target.value as ExpenseCategory)}
              className={`mt-1.5 ${field}`}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`expenses.categories.${c}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            {t('expenses.amount')}
            <input
              id="expense-amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => update('amount', e.target.value)}
              placeholder="150 000"
              className={`mt-1.5 ${field}`}
            />
          </label>
          <label className={label}>
            {t('expenses.day')}
            <input
              id="expense-day"
              type="date"
              value={form.spent_on}
              onChange={(e) => update('spent_on', e.target.value)}
              className={`mt-1.5 ${field}`}
            />
          </label>
          <label className={label}>
            {t('expenses.flat')}
            <select
              id="expense-flat"
              value={form.property_id}
              onChange={(e) => update('property_id', e.target.value)}
              className={`mt-1.5 ${field}`}
            >
              <option value="">{form.category === 'rent' ? t('expenses.flatChoose') : t('expenses.flatNone')}</option>
              {flats.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.internal_name || p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            {t('expenses.payee')}
            <input
              id="expense-payee"
              value={form.payee}
              onChange={(e) => update('payee', e.target.value)}
              className={`mt-1.5 ${field}`}
            />
          </label>
          <label className={label}>
            {t('expenses.note')}
            <input
              id="expense-note"
              value={form.note}
              onChange={(e) => update('note', e.target.value)}
              className={`mt-1.5 ${field}`}
            />
          </label>
        </div>
        {formError && (
          <p role="alert" className="text-xs text-red-600">
            {formError}
          </p>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={createExpense.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {t('expenses.save')}
        </button>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-bold text-gray-900">{t('expenses.list')}</h2>
          <span data-testid="expenses-total" className="text-sm font-bold text-gray-900">
            {t('expenses.total', { amount: format(total) })}
          </span>
        </div>
        {isLoading ? null : expenses.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-500">{t('expenses.empty')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="w-24 shrink-0 text-gray-500">{e.spent_on}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-gray-900">{t(`expenses.categories.${e.category}`)}</span>
                  {e.property_id && <span className="text-gray-500"> · {flatName.get(e.property_id) ?? '—'}</span>}
                  {(e.payee || e.note) && (
                    <span className="block truncate text-xs text-gray-500">
                      {[e.payee, e.note].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <span className="font-semibold text-gray-900">{format(e.amount)}</span>
                <button
                  type="button"
                  onClick={() => cancelExpense(e.id)}
                  aria-label={t('expenses.void')}
                  title={t('expenses.void')}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                >
                  <Ban className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
