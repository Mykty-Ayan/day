import { useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAnalyticsMetrics, useAnalyticsTimeSeries } from '../../hooks/useAnalytics'
import { useProperties } from '../../hooks/useProperties'
import { exportAnalyticsCsv } from '../../api/analytics'
import type { PeriodPreset, Granularity } from '../../types/analytics'
import { alignPrevious, customRange, previousRange } from './period'
import { useDates } from '../../hooks/useDates'
import SummaryCards from '../../components/analytics/SummaryCards'
import MetricsTable from '../../components/analytics/MetricsTable'
import RevenueChart from '../../components/analytics/RevenueChart'
import OccupancyChart from '../../components/analytics/OccupancyChart'
import MonthsChart from '../../components/analytics/MonthsChart'
import { MoneyFlow, SourcesTable } from '../../components/analytics/MoneyFlow'
import PaymentsCard from '../../components/analytics/PaymentsCard'
import AnalyticsFilterBar from '../../components/analytics/AnalyticsFilters'
import { showToast } from '../../components/ui/Toast'
import Spinner from '../../components/ui/Spinner'

export default function AnalyticsDashboardPage() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<PeriodPreset>('month')
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [propertyIds, setPropertyIds] = useState<string[]>([])
  const [source, setSource] = useState('all')
  const [range, setRange] = useState({ from: '', to: '' })

  // The owner's own period asks nothing until both days are picked: the API
  // would answer the last 30 days and pass them off as the chosen period.
  const custom = period === 'custom' ? customRange(range.from, range.to) : null
  const waiting = period === 'custom' && custom === null
  const filters = {
    period,
    ...custom,
    granularity,
    property_ids: propertyIds.length > 0 ? propertyIds : undefined,
    source: source === 'all' ? undefined : source,
  }

  const {
    data: metricsData,
    isLoading: metricsLoading,
    isError: metricsError,
    refetch: refetchMetrics,
  } = useAnalyticsMetrics(filters, !waiting)
  const {
    data: timeSeriesData,
    isLoading: timeSeriesLoading,
    isError: timeSeriesError,
    refetch: refetchTimeSeries,
  } = useAnalyticsTimeSeries(filters, !waiting)
  // The same numbers for the period just before, as long: how each one changed.
  const before = metricsData ? previousRange(metricsData.date_from, metricsData.date_to) : null
  const { data: previousData } = useAnalyticsMetrics({ ...filters, period: undefined, ...before }, !waiting && before !== null)
  // The period before by day, laid out on this period's bars: by week or month the bars of the
  // two periods fall on different calendar edges and would not match by index.
  const { data: previousDays } = useAnalyticsTimeSeries(
    { ...filters, period: undefined, granularity: 'day', ...before },
    !waiting && before !== null,
  )
  const previousSeries =
    before && timeSeriesData && previousDays
      ? alignPrevious(timeSeriesData.data, timeSeriesData.date_from, timeSeriesData.date_to, before.date_from, previousDays.data)
      : undefined
  const { range: dayRange } = useDates()
  const { data: propertiesData } = useProperties({ per_page: 100, status: 'active' })
  const properties = propertiesData?.items ?? []

  async function handleExport() {
    // Without both days the API would export the last 30 days as if chosen.
    if (waiting) return
    try {
      const blob = await exportAnalyticsCsv(filters)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = custom ? `analytics-${range.from}-${range.to}.csv` : `analytics-${period}.csv`
      a.click()
      URL.revokeObjectURL(url)
      showToast('success', t('analytics.reportExported'))
    } catch {
      showToast('error', t('analytics.failedExport'))
    }
  }

  const isLoading = metricsLoading || timeSeriesLoading
  const isError = metricsError || timeSeriesError
  const hasSeriesData = (timeSeriesData?.data?.length ?? 0) > 0
  const hasPropertyData = (metricsData?.properties?.length ?? 0) > 0
  const isEmpty = !hasSeriesData && !hasPropertyData

  function handleRetry() {
    refetchMetrics()
    refetchTimeSeries()
  }

  return (
    <div className="px-4 py-4 sm:px-6 sm:py-6 max-w-7xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-ink">{t('analytics.title')}</h1>
        </div>

        {/* Filters */}
        <div className="mb-6">
          <AnalyticsFilterBar
            period={period}
            onPeriodChange={setPeriod}
            granularity={granularity}
            onGranularityChange={setGranularity}
            propertyIds={propertyIds}
            onPropertyChange={setPropertyIds}
            source={source}
            onSourceChange={setSource}
            range={range}
            onRangeChange={setRange}
            properties={properties}
            onExport={handleExport}
            exportDisabled={waiting}
          />
        </div>

        {waiting ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-ink-muted">{t('analytics.pickPeriod')}</p>
          </div>
        ) : isLoading ? (
          <Spinner />
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="mb-1 text-sm font-semibold text-ink">{t('common.errorTitle')}</p>
            <p className="mb-4 text-sm text-ink-muted">{t('common.errorLoading')}</p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleRetry}
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-line bg-surface-card px-6 py-2.5 font-semibold text-ink transition-colors hover:bg-surface-page"
            >
              {t('common.retry')}
            </motion.button>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-ink-muted">{t('analytics.noData')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Summary Cards */}
            {metricsData && (
              <div className="flex flex-col gap-2">
                <SummaryCards summary={metricsData.summary} previous={previousData?.summary} />
                {before && previousData && (
                  <p className="text-xs text-ink-muted">
                    {t('analytics.comparedWith', { range: dayRange(before.date_from, format(addDays(parseISO(before.date_to), -1), 'yyyy-MM-dd')) })}
                  </p>
                )}
              </div>
            )}

            <MonthsChart propertyIds={filters.property_ids} source={filters.source} />

            {metricsData && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <MoneyFlow summary={metricsData.summary} />
                <PaymentsCard filters={{ ...filters, granularity: undefined }} />
                {/* Full width: four columns of sums need the room. */}
                <div className="lg:col-span-2">
                  <SourcesTable summary={metricsData.summary} />
                </div>
              </div>
            )}

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RevenueChart data={timeSeriesData?.data ?? []} previous={previousSeries} />
              <OccupancyChart data={timeSeriesData?.data ?? []} previous={previousSeries} />
            </div>

            {/* Property Table */}
            {metricsData && (
              <div>
                <h2 className="text-sm font-bold text-ink mb-3">{t('analytics.byProperty')}</h2>
                <MetricsTable properties={metricsData.properties} />
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  )
}
