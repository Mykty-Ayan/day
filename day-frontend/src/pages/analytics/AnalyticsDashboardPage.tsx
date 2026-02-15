import { useState } from 'react'
import { motion } from 'framer-motion'
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

export default function AnalyticsDashboardPage() {
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

  const { data: metricsData, isLoading: metricsLoading } = useAnalyticsMetrics(filters)
  const { data: timeSeriesData, isLoading: timeSeriesLoading } = useAnalyticsTimeSeries(filters)
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
      showToast('success', 'Report exported successfully')
    } catch {
      showToast('error', 'Failed to export report')
    }
  }

  const isLoading = metricsLoading || timeSeriesLoading

  return (
    <div className="p-6 max-w-7xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
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
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
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
                <h2 className="text-sm font-bold text-gray-900 mb-3">By Property</h2>
                <MetricsTable properties={metricsData.properties} />
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  )
}
