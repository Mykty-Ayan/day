import { useTranslation } from 'react-i18next'
import { useCurrency } from '../../hooks/useCurrency'
import type { AnalyticsSummary } from '../../types/analytics'

type Line = { key: string; label: string; amount: number; kind: 'in' | 'out' | 'left' }

/** Where the money went: what came in, the platforms' cut, each kind of expense from the
 *  journal, and what is left. The lines add up as the profit is counted: revenue less
 *  the commission less the journal. Bars are to the scale of what came in. */
export function MoneyFlow({ summary }: { summary: AnalyticsSummary }) {
  const { t } = useTranslation()
  const { format: money } = useCurrency()
  const lines: Line[] = [
    { key: 'revenue', label: t('analytics.flow.revenue'), amount: Number(summary.total_revenue), kind: 'in' },
    ...(Number(summary.total_commission) > 0
      ? [{ key: 'commission', label: t('analytics.flow.commission'), amount: Number(summary.total_commission), kind: 'out' as const }]
      : []),
    ...(summary.expenses_by_category ?? []).map((row) => ({
      key: row.category,
      label: t(`expenses.categories.${row.category}`, { defaultValue: row.category }),
      amount: Number(row.amount),
      kind: 'out' as const,
    })),
    { key: 'profit', label: t('analytics.flow.profit'), amount: Number(summary.total_profit), kind: 'left' },
  ]
  const scale = Math.max(...lines.map((line) => Math.abs(line.amount)), 1)

  return (
    <section className="rounded-xl border border-line bg-surface-card p-5" aria-labelledby="money-flow">
      <h3 id="money-flow" className="mb-4 text-sm font-bold text-ink">
        {t('analytics.flow.title')}
      </h3>
      <ul className="flex flex-col gap-2.5">
        {lines.map((line) => {
          const sign = line.kind === 'out' ? '−' : line.amount < 0 ? '−' : ''
          const loss = line.kind === 'left' && line.amount < 0
          return (
            <li key={line.key} data-testid="flow-line" className={line.kind === 'left' ? 'border-t border-line pt-2.5' : ''}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={line.kind === 'out' ? 'text-ink-muted' : 'font-semibold text-ink'}>{line.label}</span>
                <span className={`shrink-0 tabular-nums ${line.kind === 'out' ? 'text-ink-muted' : 'font-semibold'} ${loss ? 'text-danger' : 'text-ink'}`}>
                  {sign}
                  {money(Math.abs(line.amount))}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-page" aria-hidden="true">
                <div
                  className={`h-full rounded-full ${line.kind === 'out' ? 'bg-ink-muted/40' : loss ? 'bg-danger' : 'bg-accent'}`}
                  style={{ width: `${(Math.abs(line.amount) / scale) * 100}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The revenue by where the bookings came from, the largest first: each source's money,
 *  the platform's cut and what is left of it, and its share of all. */
export function SourcesTable({ summary }: { summary: AnalyticsSummary }) {
  const { t } = useTranslation()
  const { format: money } = useCurrency()
  const rows = summary.by_source ?? []
  const all = rows.reduce((sum, row) => sum + Number(row.revenue), 0)

  return (
    <section className="rounded-xl border border-line bg-surface-card p-5" aria-labelledby="money-sources">
      <h3 id="money-sources" className="mb-4 text-sm font-bold text-ink">
        {t('analytics.bySource')}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('analytics.noRevenueData')}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th scope="col" className="pb-2 font-semibold">{t('analytics.source')}</th>
              <th scope="col" className="pb-2 text-right font-semibold">{t('analytics.revenue')}</th>
              <th scope="col" className="hidden pb-2 text-right font-semibold sm:table-cell">{t('analytics.flow.commission')}</th>
              <th scope="col" className="pb-2 text-right font-semibold">{t('analytics.net')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const revenue = Number(row.revenue)
              const commission = Number(row.commission)
              const share = all > 0 ? Math.round((revenue / all) * 100) : 0
              return (
                <tr key={row.source} data-testid="source-row" className="border-t border-line">
                  <th scope="row" className="py-2 pr-2 text-left font-semibold text-ink">
                    {t(`bookings.sources.${row.source}`, { defaultValue: row.source })}
                    <span className="block text-xs font-normal text-ink-muted">
                      {t('analytics.sourceShare', { share, count: row.bookings })}
                    </span>
                  </th>
                  <td className="py-2 text-right tabular-nums text-ink">{money(revenue)}</td>
                  <td className="hidden py-2 text-right tabular-nums text-ink-muted sm:table-cell">
                    {commission > 0 ? `−${money(commission)}` : '—'}
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums text-ink">{money(revenue - commission)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
