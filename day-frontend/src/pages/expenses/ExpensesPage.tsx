import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'
import { Ban, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { format as formatDay, parseISO } from 'date-fns'
import Button from '../../components/ui/Button'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import DatePicker from '../../components/ui/date-picker'
import { Sheet } from '../../components/ui/sheet'
import { dateLocale } from '../../lib/date-locale'
import { shiftMonth } from '../../lib/bookings-dashboard'
import { showToast } from '../../components/ui/Toast'
import { useCurrentUser } from '../../hooks/useAuth'
import { useCurrency } from '../../hooks/useCurrency'
import { useCreateExpense, useExpenses, useVoidExpense } from '../../hooks/useExpenses'
import { useAllProperties } from '../../hooks/useProperties'
import { useAgents } from '../../hooks/useAgents'
import { useBookings } from '../../hooks/useBookings'
import AgentSelect from '../../components/agents/AgentSelect'
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
  'min-h-[44px] w-full min-w-0 rounded-xl border border-line bg-surface-card px-3 text-sm text-ink outline-none focus:border-accent'
const label = 'block text-xs font-semibold text-ink'
const ADD =
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface-card px-3.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-page'

/** The server's reason for refusing, when it gave one (a sentence, or pydantic's list). */
function serverReason(error: unknown): string | null {
  if (!isAxiosError(error)) return null
  const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('; ') || null
  return null
}

/** Today on this device's calendar, as YYYY-MM-DD. */
function localToday(): string {
  return new Date().toLocaleDateString('sv-SE')
}

export default function ExpensesPage() {
  const { t, i18n } = useTranslation()
  const locale = dateLocale(i18n.language)
  const [adding, setAdding] = useState(false)
  const [voiding, setVoiding] = useState<string | null>(null)
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
  const isCommission = form.category === 'agent_commission'
  const { data: agents = [] } = useAgents()
  // The commission is for a guest the agent brought: offer that agent's bookings.
  const { data: agentBookings } = useBookings({ agent_id: form.agent_id, per_page: 100 }, isCommission && !!form.agent_id)

  // Rent may be paid for a flat on pause too; an archived one is gone.
  const flats = useMemo(() => (allFlats?.items ?? []).filter((p) => p.status !== 'archived'), [allFlats])
  const flatName = useMemo(() => new Map((allFlats?.items ?? []).map((p) => [p.id, p.internal_name || p.name])), [allFlats])
  const agentName = useMemo(() => new Map(agents.map((a) => [a.id, a.name])), [agents])
  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0)

  if (!isOwner) {
    return <p className="p-6 text-sm text-ink-muted">{t('expenses.ownerOnly')}</p>
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
        agent_id: isCommission ? form.agent_id || null : null,
        booking_id: isCommission ? form.booking_id || null : null,
      })
      showToast('success', t('expenses.saved'))
      // Show the month the expense went to, or it seems to vanish.
      setMonth(form.spent_on.slice(0, 7))
      setForm(emptyExpenseForm(form.spent_on))
      setAdding(false)
    } catch (error) {
      const reason = serverReason(error)
      if (reason) setFormError(reason)
      showToast('error', t('expenses.failed'))
    }
  }

  // Money: a voided expense leaves the books' totals, so the app's dialog asks first.
  async function cancelExpense() {
    if (!voiding) return
    try {
      await voidExpense.mutateAsync(voiding)
      showToast('success', t('expenses.voided'))
      setVoiding(null)
    } catch {
      showToast('error', t('expenses.failed'))
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">{t('expenses.title')}</h1>
        <button type="button" onClick={() => setAdding(true)} className={ADD}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('expenses.addButton')}
        </button>
      </div>
      <div className="mb-5 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, -1))}
          aria-label={t('bookings.overview.prevMonth')}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-card hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 id="expenses-month" className="min-w-[9.5rem] text-center text-base font-semibold text-ink first-letter:uppercase" aria-live="polite">
          {formatDay(parseISO(`${month}-01`), 'LLLL yyyy', { locale })}
        </h2>
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
          aria-label={t('bookings.overview.nextMonth')}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-card hover:text-ink"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <Sheet open={adding} onClose={() => setAdding(false)} title={t('expenses.add')}>
      <section className="space-y-3">
        <div className="grid grid-cols-1 gap-3">
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
            <DatePicker id="expense-day" value={form.spent_on} onChange={(day) => update('spent_on', day)} className="mt-1.5" />
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
          {isCommission && (
            <>
              <label className={label}>
 {t('expenses.agent')}
                <AgentSelect
                  id="expense-agent"
                  value={form.agent_id}
                  onChange={(agentId) => {
                    setForm((f) => ({ ...f, agent_id: agentId, booking_id: '' }))
                    setFormError(null)
                  }}
                  emptyLabel={t('expenses.agentChoose')}
                  className={`mt-1.5 ${field}`}
                />
              </label>
              <label className={label}>
 {t('expenses.booking')}
                <select
                  id="expense-booking"
                  value={form.booking_id}
                  onChange={(e) => update('booking_id', e.target.value)}
                  disabled={!form.agent_id}
                  className={`mt-1.5 ${field}`}
                >
                  <option value="">{t('expenses.bookingNone')}</option>
                  {(agentBookings?.items ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {[b.check_in.slice(0, 10), b.guest_name, b.property_internal_name || b.property_name].join(' · ')}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
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
          <p role="alert" className="text-xs text-danger">
            {formError}
          </p>
        )}
        <Button onClick={submit} disabled={createExpense.isPending} className="w-full">
          {t('expenses.save')}
        </Button>
      </section>
      </Sheet>

      <section className="overflow-hidden rounded-2xl border border-line bg-surface-card">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">{t('expenses.list')}</h2>
          <span data-testid="expenses-total" className="text-sm font-bold text-ink">
            {t('expenses.total', { amount: format(total) })}
          </span>
        </div>
        {isLoading ? null : expenses.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-muted">{t('expenses.empty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="w-16 shrink-0 text-ink-muted">{formatDay(parseISO(e.spent_on), 'd MMM', { locale })}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-ink">{t(`expenses.categories.${e.category}`)}</span>
                  {e.property_id && <span className="text-ink-muted"> · {flatName.get(e.property_id) ?? '—'}</span>}
                  {e.agent_id && <span className="text-ink-muted"> · {agentName.get(e.agent_id) ?? '—'}</span>}
                  {(e.payee || e.note) && (
                    <span className="block truncate text-xs text-ink-muted">
                      {[e.payee, e.note].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-ink">{format(e.amount)}</span>
                <button
                  type="button"
                  onClick={() => setVoiding(e.id)}
                  aria-label={t('expenses.void')}
                  title={t('expenses.void')}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-page hover:text-danger"
                >
                  <Ban className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={voiding !== null}
        title={t('expenses.voidTitle')}
        message={t('expenses.voidConfirm')}
        confirmLabel={t('expenses.void')}
        variant="danger"
        loading={voidExpense.isPending}
        onConfirm={cancelExpense}
        onCancel={() => setVoiding(null)}
      />
    </div>
  )
}
