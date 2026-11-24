import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { useAnalyticsTimeSeries } from '../../hooks/useAnalytics'
import { useCurrency } from '../../hooks/useCurrency'
import { dateLocale } from '../../lib/date-locale'
import { monthsWindow } from '../../pages/analytics/period'

/** Revenue by month, as Airbnb's earnings: the months gone, this one, and what is already
 *  booked for the months ahead. Its own months, whatever period the page shows; the same
 *  objects and source. A booking's price falls on the months of its nights. */
export default function MonthsChart({ propertyIds, source }: { propertyIds?: string[]; source?: string }) {
  const { t, i18n } = useTranslation()
  const locale = dateLocale(i18n.language)
  const { format: money } = useCurrency()
  const [active, setActive] = useState<number | null>(null)
  const span = monthsWindow(format(new Date(), 'yyyy-MM-dd'))
  const { data, isLoading } = useAnalyticsTimeSeries({
    date_from: span.date_from,
    date_to: span.date_to,
    granularity: 'month',
    property_ids: propertyIds,
    source,
  })
  const months = (data?.data ?? []).filter((point) => point.period_start)
  const values = months.map((point) => Math.max(0, Number(point.revenue) || 0))
  const max = Math.max(...values, 0)

  return (
    <section className="rounded-xl border border-line bg-surface-card p-5" aria-labelledby="months-chart">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id="months-chart" className="text-sm font-bold text-ink">
          {t('analytics.byMonth')}
        </h3>
        {/* The legend in words besides the fill: booked ahead is paler. */}
        <div className="flex gap-3 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden="true" />
            {t('analytics.monthsDone')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-accent/35" aria-hidden="true" />
            {t('analytics.monthsBooked')}
          </span>
        </div>
      </div>
      {isLoading ? (
        <div className="h-40" />
      ) : max === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-ink-muted">{t('analytics.noMonthsData')}</div>
      ) : (
        <ul className="flex h-40 items-end gap-2">
          {months.map((point, i) => {
            const start = point.period_start!
            const ahead = start > span.current
            const current = start === span.current
            const name = format(parseISO(start), 'LLL', { locale })
            const label = `${format(parseISO(start), 'LLLL yyyy', { locale })}: ${money(values[i])}${ahead ? `, ${t('analytics.monthsBooked').toLowerCase()}` : ''}`
            return (
              <li key={start} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                <button
                  type="button"
                  data-testid="month-bar"
                  data-ahead={ahead}
                  aria-label={label}
                  onClick={() => setActive((was) => (was === i ? null : i))}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  className="group relative flex w-full flex-1 items-end focus:outline-none"
                >
                  {active === i && (
                    <span className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-3 py-2 text-xs text-white">
                      <span className="block font-bold">{money(values[i])}</span>
                      <span className="block text-white/70">
                        {format(parseISO(start), 'LLLL yyyy', { locale })}
                        {ahead && ` · ${t('analytics.monthsBooked').toLowerCase()}`}
                      </span>
                    </span>
                  )}
                  <span
                    className={`block w-full rounded-t-md ${ahead ? 'bg-accent/35' : 'bg-accent'} group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-offset-2`}
                    style={{ height: `${Math.max((values[i] / max) * 100, values[i] > 0 ? 2 : 0)}%` }}
                  />
                </button>
                <span className={`text-[11px] ${current ? 'font-bold text-ink' : 'text-ink-muted'}`}>{name}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
