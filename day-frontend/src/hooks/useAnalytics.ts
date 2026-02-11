import { useQuery } from '@tanstack/react-query'
import type { AnalyticsFilters } from '../types/analytics'
import {
  getAnalyticsMetrics,
  getAnalyticsTimeSeries,
} from '../api/analytics'

const ANALYTICS_METRICS_KEY = 'analytics-metrics'
const ANALYTICS_TIME_SERIES_KEY = 'analytics-time-series'

export function useAnalyticsMetrics(filters: AnalyticsFilters = {}) {
  return useQuery({
    queryKey: [ANALYTICS_METRICS_KEY, filters],
    queryFn: () => getAnalyticsMetrics(filters),
  })
}

export function useAnalyticsTimeSeries(filters: AnalyticsFilters = {}) {
  return useQuery({
    queryKey: [ANALYTICS_TIME_SERIES_KEY, filters],
    queryFn: () => getAnalyticsTimeSeries(filters),
  })
}
