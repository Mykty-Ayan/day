import { useTranslation } from 'react-i18next'
import type { TimeSeriesPoint } from '../../types/analytics'
import { intlLocale } from '../../pages/miniapp/format'
import TrendChart from './TrendChart'

/** The rate in percent; an old answer gave a fraction (0.5), the scale stays 0–100. */
function percentOf(point: TimeSeriesPoint, fraction: boolean): number {
  const rate = Number(point.occupancy_rate)
  if (!Number.isFinite(rate) || rate <= 0) return 0
  return Math.min(fraction ? rate * 100 : rate, 100)
}

/** The period's occupancy day by day (or week, month), against the period before. */
export default function OccupancyChart({ data, previous }: { data: TimeSeriesPoint[]; previous?: TimeSeriesPoint[] }) {
  const { t, i18n } = useTranslation()
  const lang = intlLocale(i18n.language)
  const percent = (rate: number) => `${rate.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

  if (data.length === 0) {
    return <div className="flex items-center justify-center py-12 text-sm text-ink-muted">{t('analytics.noData')}</div>
  }
  const rates = [...data, ...(previous ?? [])].map((point) => Number(point.occupancy_rate)).filter((rate) => rate > 0)
  const fraction = rates.length > 0 && Math.max(...rates) <= 1
  return (
    <TrendChart
      title={t('analytics.occupancyRate')}
      data={data}
      previous={previous}
      value={(point) => percentOf(point, fraction)}
      format={percent}
      formatAxis={(rate) => `${rate.toLocaleString(lang, { maximumFractionDigits: 0 })}%`}
      detail={(point) =>
        t('analytics.nightsTaken', { nights: Number(point.booked_nights).toLocaleString(lang, { maximumFractionDigits: 2 }) })
      }
      cap={100}
      empty={t('analytics.noOccupancyData')}
      testId="occupancy-chart"
    />
  )
}
