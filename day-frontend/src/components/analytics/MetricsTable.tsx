import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PropertyMetrics } from '../../types/analytics'
import { useCurrency } from '../../hooks/useCurrency'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import type { ViewMode } from '../../types/view-mode'
import { isViewMode } from '../../types/view-mode'

type SortField = keyof Pick<
  PropertyMetrics,
  'revenue' | 'adr' | 'revpar' | 'profit' | 'occupancy_rate' | 'avg_stay_duration' | 'total_bookings'
>

const METRICS_TABLE_VIEW_MODE_STORAGE_KEY = 'day:analytics:metrics-view-mode'

function readInitialViewMode(): ViewMode {
  if (typeof window === 'undefined') return 'table'

  try {
    const stored = window.localStorage.getItem(METRICS_TABLE_VIEW_MODE_STORAGE_KEY)
    if (isViewMode(stored)) {
      return stored
    }
  } catch {
    // Ignore storage errors and fallback to viewport-aware default.
  }

  return window.matchMedia('(max-width: 1023px)').matches ? 'cards' : 'table'
}

export default function MetricsTable({ properties }: { properties: PropertyMetrics[] }) {
  const { t } = useTranslation()
  const { symbol } = useCurrency()
  const [sortField, setSortField] = useState<SortField>('revenue')
  const [sortAsc, setSortAsc] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(() => readInitialViewMode())

  const columns: { key: SortField; label: string; format: (v: number) => string }[] = [
    { key: 'revenue', label: t('analytics.revenue'), format: (v) => `${symbol}${v.toLocaleString()}` },
    { key: 'adr', label: t('analytics.adr'), format: (v) => `${symbol}${Number(v).toFixed(0)}` },
    { key: 'revpar', label: t('analytics.revpar'), format: (v) => `${symbol}${Number(v).toFixed(0)}` },
    { key: 'profit', label: t('analytics.profit'), format: (v) => `${symbol}${v.toLocaleString()}` },
    { key: 'occupancy_rate', label: t('analytics.occupancy'), format: (v) => `${Number(v).toFixed(1)}%` },
    { key: 'avg_stay_duration', label: t('analytics.avgStay'), format: (v) => `${Number(v).toFixed(1)}d` },
    { key: 'total_bookings', label: t('analytics.bookings'), format: (v) => v.toString() },
  ]

  const sorted = [...properties].sort((a, b) => {
    const av = Number(a[sortField])
    const bv = Number(b[sortField])
    return sortAsc ? av - bv : bv - av
  })

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
    { value: 'cards', label: t('common.cards') },
    { value: 'table', label: t('common.table') },
  ]

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(METRICS_TABLE_VIEW_MODE_STORAGE_KEY, viewMode)
    } catch {
      // Ignore storage write errors.
    }
  }, [viewMode])

  if (properties.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        {t('analytics.noPropertyData')}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="w-full overflow-x-auto">
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => {
            if (!value) return
            setViewMode(value as ViewMode)
          }}
          className="min-w-max"
        >
          {VIEW_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {viewMode === 'cards' ? (
        <div className="space-y-3">
          {sorted.map((pm, i) => (
            <motion.div
              key={pm.property_id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.02 }}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-3 min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {pm.property_internal_name}
                </p>
                <p className="truncate text-xs text-gray-500">{pm.property_name}</p>
              </div>
              <div className="grid grid-cols-1 gap-2 text-xs text-gray-600 sm:grid-cols-2">
                {columns.map((col) => (
                  <div key={col.key} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                    <span className="truncate text-gray-500">{col.label}</span>
                    <span className="shrink-0 font-semibold text-gray-900">
                      {col.format(Number(pm[col.key]))}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">
                    {t('analytics.property')}
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="text-right px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 transition-colors select-none"
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        <ArrowUpDown className={`w-3 h-3 ${sortField === col.key ? 'text-gray-900' : ''}`} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((pm, i) => (
                  <motion.tr
                    key={pm.property_id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.02 }}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <span className="text-sm font-medium text-gray-900">
                          {pm.property_internal_name}
                        </span>
                        <span className="block text-xs text-gray-400">{pm.property_name}</span>
                      </div>
                    </td>
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3 text-right">
                        <span className="text-sm text-gray-700">
                          {col.format(Number(pm[col.key]))}
                        </span>
                      </td>
                    ))}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
