export type PeriodPreset = 'week' | 'month' | 'quarter' | 'year' | 'custom'
export type Granularity = 'day' | 'week' | 'month'

export interface PropertyMetrics {
  property_id: string
  property_name: string
  property_internal_name: string
  revenue: number
  adr: number
  revpar: number
  expenses: number
  profit: number
  commission: number
  vacancy_days: number
  occupancy_rate: number
  avg_stay_duration: number
  total_bookings: number
  booked_nights: number
}

export interface AnalyticsSummary {
  total_revenue: number
  total_expenses: number
  total_profit: number
  total_commission: number
  overall_adr: number
  overall_revpar: number
  overall_occupancy_rate: number
  avg_stay_duration: number
  total_bookings: number
  total_booked_nights: number
  total_vacancy_days: number
  properties_count: number
}

export interface AnalyticsMetricsResponse {
  summary: AnalyticsSummary
  properties: PropertyMetrics[]
  date_from: string
  date_to: string
}

export interface TimeSeriesPoint {
  period_start: string | null
  period_label: string
  revenue: number
  bookings_count: number
  booked_nights: number
  occupancy_rate: number
}

export interface TimeSeriesResponse {
  data: TimeSeriesPoint[]
  granularity: Granularity
  date_from: string
  date_to: string
}

export interface AnalyticsFilters {
  date_from?: string
  date_to?: string
  period?: PeriodPreset
  granularity?: Granularity
  property_ids?: string[]
  source?: string
}
