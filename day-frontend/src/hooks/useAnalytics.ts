import { useQuery } from '@tanstack/react-query'
import type { AnalyticsFilters } from '../types/analytics'
import {
  getAnalyticsMetrics,
  getAnalyticsPayments,
  getAnalyticsTimeSeries,
} from '../api/analytics'

const ANALYTICS_METRICS_KEY = 'analytics-metrics'
const ANALYTICS_TIME_SERIES_KEY = 'analytics-time-series'

export function useAnalyticsMetrics(filters: AnalyticsFilters = {}, enabled = true) {
  return useQuery({
    queryKey: [ANALYTICS_METRICS_KEY, filters],
    queryFn: () => getAnalyticsMetrics(filters),
    enabled,
  })
}

export function useAnalyticsTimeSeries(filters: AnalyticsFilters = {}, enabled = true) {
  return useQuery({
    queryKey: [ANALYTICS_TIME_SERIES_KEY, filters],
    queryFn: () => getAnalyticsTimeSeries(filters),
    enabled,
  })
}

export function useAnalyticsPayments(filters: AnalyticsFilters = {}, enabled = true) {
  return useQuery({
    queryKey: ['analytics-payments', filters],
    queryFn: () => getAnalyticsPayments(filters),
    enabled,
  })
}
