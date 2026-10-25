/**
 * Money for a month: what came in, went out and stayed (the server's figures,
 * as the web analytics shows them), how full the flats were, who still owes,
 * who paid, and what was spent. A booking row opens its card.
 *
 * The analytics' costs are platform commissions and the flats' own costs, not
 * the expense journal below; the tile is named so the two do not seem to disagree.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { CircleAlert, Plus, Receipt, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getAnalyticsMetrics } from '../../api/analytics'
import { listBookings } from '../../api/bookings'
import { listExpenses } from '../../api/expenses'
import type { Booking } from '../../types/booking'
import ExpenseSheet from './ExpenseSheet'
import { formatDay, formatMoney } from './format'
import { ActionButton, BookingRow, Chip, Section } from './miniapp-ui'
import { debts, owed, periodRange, received, type MoneyPeriod } from './money'

export default function MoneyScreen({
  enabled,
  today,
  onOpen,
}: {
  enabled: boolean
  today: Date
  onOpen: (booking: Booking) => void
}) {
  const { t, i18n } = useTranslation()
  const [period, setPeriod] = useState<MoneyPeriod>('month')
  const [adding, setAdding] = useState(false)
  const range = periodRange(period, today)
  const money = (value: number) => `${formatMoney(value, i18n.language)} ₸`

  const metrics = useQuery({
    queryKey: ['miniapp', 'money', 'metrics', range.date_from],
    queryFn: () => getAnalyticsMetrics({ ...range, period: 'custom' }),
    enabled,
  })
  const bookings = useQuery({
    queryKey: ['miniapp', 'money', 'bookings', range.date_from],
    // Stays touching the month; a busy month of six flats fits one page.
    queryFn: () => listBookings({ ...range, per_page: 100 }),
    enabled,
  })
  const expenses = useQuery({
    queryKey: ['miniapp', 'money', 'expenses', range.date_from],
    queryFn: () => listExpenses(range),
    enabled,
    retry: false,
  })

  const summary = metrics.data?.summary
  const owing = debts(bookings.data?.items ?? [])
  const paid = received(bookings.data?.items ?? [])
  const spent = (expenses.data ?? []).filter((expense) => !expense.voided_at)
  const ownerOnly = isAxiosError(expenses.error) && expenses.error.response?.status === 403
  const stay = (booking: Booking) =>
    `${formatDay(booking.check_in, i18n.language)} → ${formatDay(booking.check_out, i18n.language)}`

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {(['month', 'lastMonth'] as MoneyPeriod[]).map((value) => (
          <Chip
            key={value}
            label={t(`miniapp.moneyTab.${value}`)}
            active={period === value}
            onClick={() => setPeriod(value)}
          />
        ))}
      </div>

      {metrics.isError && <p className="text-sm">{t('miniapp.loadFailed')}</p>}
      {summary && (
        <div className="tg-surface grid grid-cols-2 gap-px overflow-hidden rounded-xl">
          {(
            [
              ['income', money(summary.total_revenue)],
              ['expenses', money(summary.total_expenses)],
              ['profit', money(summary.total_profit)],
              ['occupancy', `${Number(summary.overall_occupancy_rate).toFixed(0)}%`],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="px-3 py-2.5">
              <p className="tg-hint text-xs font-bold uppercase tracking-wide">{t(`miniapp.moneyTab.${key}`)}</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      )}

      {bookings.isLoading && <p className="tg-hint text-sm">{t('miniapp.loading')}</p>}
      {bookings.isError && <p className="text-sm">{t('miniapp.loadFailed')}</p>}
      {bookings.data && (
        <>
          <Section
            icon={<CircleAlert className="h-4 w-4" />}
            title={t('miniapp.moneyTab.debts', { amount: money(owing.total) })}
            count={owing.items.length}
            emptyLabel={t('miniapp.moneyTab.noDebts')}
          >
            {owing.items.map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                meta={stay(booking)}
                onOpen={() => onOpen(booking)}
                extra={
                  <span className="shrink-0 text-xs font-bold text-red-500 tabular-nums">{money(owed(booking))}</span>
                }
              />
            ))}
          </Section>
          <Section
            icon={<Wallet className="h-4 w-4" />}
            title={t('miniapp.moneyTab.paid', { amount: money(paid.total) })}
            count={paid.items.length}
            emptyLabel={t('miniapp.empty')}
          >
            {paid.items.map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                meta={stay(booking)}
                onOpen={() => onOpen(booking)}
                extra={
                  <span className="shrink-0 text-xs font-bold tabular-nums">{money(booking.paid_amount ?? 0)}</span>
                }
              />
            ))}
          </Section>
        </>
      )}

      {ownerOnly ? (
        <p className="tg-hint px-1 text-xs">{t('expenses.ownerOnly')}</p>
      ) : (
        <Section
          icon={<Receipt className="h-4 w-4" />}
          title={t('miniapp.moneyTab.spent', {
            amount: money(spent.reduce((total, expense) => total + Number(expense.amount), 0)),
          })}
          count={spent.length}
          emptyLabel={expenses.isError ? t('miniapp.loadFailed') : t('expenses.empty')}
        >
          {spent.map((expense) => (
            <div key={expense.id} className="flex min-h-[48px] items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {t(`expenses.categories.${expense.category}`)}
                </span>
                <span className="tg-hint block truncate text-xs">
                  {[formatDay(`${expense.spent_on}T12:00:00`, i18n.language), expense.payee, expense.note]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{money(Number(expense.amount))}</span>
            </div>
          ))}
        </Section>
      )}
      {!ownerOnly && (
        <ActionButton onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" />
          {t('expenses.add')}
        </ActionButton>
      )}

      {adding && <ExpenseSheet onClose={() => setAdding(false)} />}
    </div>
  )
}
