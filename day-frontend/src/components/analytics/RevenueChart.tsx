import { useTranslation } from 'react-i18next'
import type { TimeSeriesPoint } from '../../types/analytics'
import { useCurrency } from '../../hooks/useCurrency'
import type { PreviousPoint } from '../../pages/analytics/period'
import TrendChart from './TrendChart'

/** The period's revenue day by day (or week, month), against the period before. */
export default function RevenueChart({ data, previous }: { data: TimeSeriesPoint[]; previous?: (PreviousPoint | null)[] }) {
  const { t } = useTranslation()
  const { format: money, formatCompact } = useCurrency()

  if (data.length === 0) {
    return <div className="flex items-center justify-center py-12 text-sm text-ink-muted">{t('analytics.noData')}</div>
  }
  return (
    <TrendChart
      title={t('analytics.revenue')}
      data={data}
      previous={previous}
      value={(point) => Number(point.revenue)}
      format={(value) => money(value, 0)}
      formatAxis={formatCompact}
      detail={(point) => t('analytics.bookingsCount', { count: point.bookings_count })}
      empty={t('analytics.noRevenueData')}
      testId="revenue-chart"
    />
  )
}
