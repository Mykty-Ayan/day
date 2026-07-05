import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAnalyticsMetrics, useAnalyticsTimeSeries } from '../../hooks/useAnalytics'
import { useProperties } from '../../hooks/useProperties'
import { exportAnalyticsCsv } from '../../api/analytics'
import type { PeriodPreset, Granularity } from '../../types/analytics'
import SummaryCards from '../../components/analytics/SummaryCards'
import MetricsTable from '../../components/analytics/MetricsTable'
import RevenueChart from '../../components/analytics/RevenueChart'
import OccupancyChart from '../../components/analytics/OccupancyChart'
import AnalyticsFilterBar from '../../components/analytics/AnalyticsFilters'
import { showToast } from '../../components/ui/Toast'
import Spinner from '../../components/ui/Spinner'

export default function AnalyticsDashboardPage() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<PeriodPreset>('month')
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [propertyIds, setPropertyIds] = useState<string[]>([])
  const [source, setSource] = useState('all')

  const filters = {
    period,
    granularity,
    property_ids: propertyIds.length > 0 ? propertyIds : undefined,
    source: source === 'all' ? undefined : source,
  }

  const {
    data: metricsData,
    isLoading: metricsLoading,
    isError: metricsError,
    refetch: refetchMetrics,
  } = useAnalyticsMetrics(filters)
  const {
    data: timeSeriesData,
    isLoading: timeSeriesLoading,
    isError: timeSeriesError,
    refetch: refetchTimeSeries,
  } = useAnalyticsTimeSeries(filters)
  const { data: propertiesData } = useProperties({ per_page: 100, status: 'active' })
  const properties = propertiesData?.items ?? []

  async function handleExport() {
    try {
      const blob = await exportAnalyticsCsv(filters)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `analytics-${period}.csv`
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
          <h1 className="text-xl font-bold text-gray-900">{t('analytics.title')}</h1>
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
            properties={properties}
            onExport={handleExport}
          />
        </div>

        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="mb-1 text-sm font-semibold text-gray-900">{t('common.errorTitle')}</p>
            <p className="mb-4 text-sm text-gray-500">{t('common.errorLoading')}</p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleRetry}
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-2.5 font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              {t('common.retry')}
            </motion.button>
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-gray-500">{t('analytics.noData')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Summary Cards */}
            {metricsData && <SummaryCards summary={metricsData.summary} />}

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RevenueChart data={timeSeriesData?.data ?? []} />
              <OccupancyChart data={timeSeriesData?.data ?? []} />
            </div>

            {/* Property Table */}
            {metricsData && (
              <div>
                <h2 className="text-sm font-bold text-gray-900 mb-3">{t('analytics.byProperty')}</h2>
                <MetricsTable properties={metricsData.properties} />
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  )
}
