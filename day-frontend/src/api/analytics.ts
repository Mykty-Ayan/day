import apiClient from './client'
import type {
  AnalyticsFilters,
  AnalyticsMetricsResponse,
  TimeSeriesResponse,
} from '../types/analytics'

function buildAnalyticsParams(filters: AnalyticsFilters = {}) {
  const params = new URLSearchParams()

  if (filters.date_from) params.set('date_from', filters.date_from)
  if (filters.date_to) params.set('date_to', filters.date_to)
  if (filters.period) params.set('period', filters.period)
  if (filters.granularity) params.set('granularity', filters.granularity)
  if (filters.source) params.set('source', filters.source)
  if (filters.property_ids?.length) {
    for (const id of filters.property_ids) {
      params.append('property_id', id)
    }
  }

  return params
}

// --- Metrics ---

export async function getAnalyticsMetrics(
  filters: AnalyticsFilters = {},
): Promise<AnalyticsMetricsResponse> {
  const res = await apiClient.get('/analytics/metrics', {
    params: buildAnalyticsParams(filters),
  })
  return res.data
}

// --- Time Series ---

export async function getAnalyticsTimeSeries(
  filters: AnalyticsFilters = {},
): Promise<TimeSeriesResponse> {
  const res = await apiClient.get('/analytics/time-series', {
    params: buildAnalyticsParams(filters),
  })
  return res.data
}

// --- Export ---

export async function exportAnalyticsCsv(
  filters: AnalyticsFilters = {},
): Promise<Blob> {
  const res = await apiClient.get('/analytics/export', {
    params: buildAnalyticsParams(filters),
    responseType: 'blob',
  })
  return res.data
}
