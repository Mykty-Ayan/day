import { useTranslation } from 'react-i18next'
import { useAnalyticsPayments } from '../../hooks/useAnalytics'
import { useCurrency } from '../../hooks/useCurrency'
import type { AnalyticsFilters } from '../../types/analytics'

/** The money of the period's bookings, as the Mini App's money tab shows it: what came in by
 *  way of paying, what the guests still owe for their stays; and the deposits held now. */
export default function PaymentsCard({ filters }: { filters: AnalyticsFilters }) {
  const { t } = useTranslation()
  const { format: money } = useCurrency()
  const { data } = useAnalyticsPayments(filters)
  if (!data) return null
  const received = data.received.reduce((sum, row) => sum + Number(row.amount), 0)

  return (
    <section className="rounded-xl border border-line bg-surface-card p-5" aria-labelledby="money-payments">
      <h3 id="money-payments" className="mb-4 text-sm font-bold text-ink">
        {t('analytics.payments.title')}
      </h3>
      <div className="flex flex-col gap-3 text-sm">
        <div data-testid="payments-received">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold text-ink">{t('analytics.payments.received')}</span>
            <span className="font-semibold tabular-nums text-ink">{money(received)}</span>
          </div>
          {data.received.length === 0 ? (
            <p className="mt-1 text-xs text-ink-muted">{t('analytics.payments.nothing')}</p>
          ) : (
            <ul className="mt-1.5 flex flex-col gap-1">
              {data.received.map((row) => (
                <li key={row.method} className="flex justify-between gap-3 text-ink-muted">
                  <span>{t(`miniapp.methods.${row.method}`, { defaultValue: row.method })}</span>
                  <span className="tabular-nums">{money(Number(row.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div data-testid="payments-owed" className="border-t border-line pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold text-ink">{t('analytics.payments.owed')}</span>
            <span className={`font-semibold tabular-nums ${Number(data.owed) > 0 ? 'text-danger' : 'text-ink'}`}>{money(Number(data.owed))}</span>
          </div>
          {data.owing_bookings > 0 && (
            <p className="mt-0.5 text-xs text-ink-muted">{t('analytics.bookingsCount', { count: data.owing_bookings })}</p>
          )}
        </div>
        <div data-testid="payments-deposits" className="border-t border-line pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold text-ink">{t('analytics.payments.deposits')}</span>
            <span className="font-semibold tabular-nums text-ink">{money(Number(data.deposits_on_hand))}</span>
          </div>
          {data.deposits_count > 0 && (
            <p className="mt-0.5 text-xs text-ink-muted">{t('analytics.payments.depositsCount', { count: data.deposits_count })}</p>
          )}
        </div>
      </div>
    </section>
  )
}
