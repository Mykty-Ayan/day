import apiClient from './client'
import type {
  AnalyticsFilters,
  AnalyticsMetricsResponse,
  TimeSeriesResponse,
} from '../types/analytics'

// --- Metrics ---

export async function getAnalyticsMetrics(
  filters: AnalyticsFilters = {},
): Promise<AnalyticsMetricsResponse> {
  const res = await apiClient.get('/analytics/metrics', { params: filters })
  return res.data
}

// --- Time Series ---

export async function getAnalyticsTimeSeries(
  filters: AnalyticsFilters = {},
): Promise<TimeSeriesResponse> {
  const res = await apiClient.get('/analytics/time-series', { params: filters })
  return res.data
}

// --- Export ---

export async function exportAnalyticsCsv(
  filters: AnalyticsFilters = {},
): Promise<Blob> {
  const res = await apiClient.get('/analytics/export', {
    params: filters,
    responseType: 'blob',
  })
  return res.data
}
