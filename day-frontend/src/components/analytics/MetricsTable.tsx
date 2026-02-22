import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PropertyMetrics } from '../../types/analytics'
import { useCurrency } from '../../hooks/useCurrency'

type SortField = keyof Pick<
  PropertyMetrics,
  'revenue' | 'adr' | 'revpar' | 'profit' | 'occupancy_rate' | 'avg_stay_duration' | 'total_bookings'
>

export default function MetricsTable({ properties }: { properties: PropertyMetrics[] }) {
  const { t } = useTranslation()
  const { symbol } = useCurrency()
  const [sortField, setSortField] = useState<SortField>('revenue')
  const [sortAsc, setSortAsc] = useState(false)

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

  if (properties.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        {t('analytics.noPropertyData')}
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
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
  )
}
