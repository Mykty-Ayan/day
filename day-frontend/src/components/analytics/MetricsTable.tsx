import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PropertyMetrics } from '../../types/analytics'
import { useCurrency } from '../../hooks/useCurrency'
import { intlLocale } from '../../pages/miniapp/format'

type SortField = keyof Pick<
  PropertyMetrics,
  'revenue' | 'adr' | 'revpar' | 'profit' | 'occupancy_rate' | 'avg_stay_duration' | 'total_bookings'
>

export default function MetricsTable({ properties }: { properties: PropertyMetrics[] }) {
  const { t, i18n } = useTranslation()
  const { format: money } = useCurrency()
  const [sortField, setSortField] = useState<SortField>('revenue')
  const [sortAsc, setSortAsc] = useState(false)
  const number = (v: number, digits: number) =>
    Number(v).toLocaleString(intlLocale(i18n.language), { minimumFractionDigits: digits, maximumFractionDigits: digits })

  const columns: { key: SortField; label: string; format: (v: number) => string }[] = [
    { key: 'revenue', label: t('analytics.revenue'), format: (v) => money(v) },
    { key: 'adr', label: t('analytics.adr'), format: (v) => money(Math.round(v), 0) },
    { key: 'revpar', label: t('analytics.revpar'), format: (v) => money(Math.round(v), 0) },
    { key: 'profit', label: t('analytics.profit'), format: (v) => money(v) },
    { key: 'occupancy_rate', label: t('analytics.occupancy'), format: (v) => `${number(v, 1)}%` },
    { key: 'avg_stay_duration', label: t('analytics.avgStay'), format: (v) => number(v, 1) },
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
      <div className="flex items-center justify-center py-12 text-sm text-ink-muted">
        {t('analytics.noPropertyData')}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* A card per object on a phone, the sortable table on a wide screen: no switch. */}
      <div className="space-y-3 lg:hidden">
          {sorted.map((pm, i) => (
            <motion.div
              key={pm.property_id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.02 }}
              className="rounded-xl border border-line bg-surface-card p-4"
            >
              <div className="mb-3 min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {pm.property_internal_name}
                </p>
                <p className="truncate text-xs text-ink-muted">{pm.property_name}</p>
              </div>
              <div className="grid grid-cols-1 gap-2 text-xs text-ink-muted sm:grid-cols-2">
                {columns.map((col) => (
                  <div key={col.key} className="flex items-center justify-between gap-3 rounded-lg bg-surface-page px-3 py-2">
                    <span className="truncate text-ink-muted">{col.label}</span>
                    <span className="shrink-0 font-semibold text-ink">
                      {col.format(Number(pm[col.key]))}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      <div className="hidden lg:block">
        <div className="bg-surface-card border border-line rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px]">
              <thead>
                <tr className="border-b border-line bg-surface-page">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-ink-muted">
                    {t('analytics.property')}
                  </th>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className="text-right px-4 py-3 text-xs font-semibold text-ink-muted cursor-pointer hover:text-ink transition-colors select-none"
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        <ArrowUpDown className={`w-3 h-3 ${sortField === col.key ? 'text-ink' : ''}`} />
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
                    className="border-b border-line hover:bg-surface-page transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <span className="text-sm font-medium text-ink">
                          {pm.property_internal_name}
                        </span>
                        <span className="block text-xs text-ink-muted">{pm.property_name}</span>
                      </div>
                    </td>
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3 text-right">
                        <span className="text-sm text-ink">
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
      </div>
    </div>
  )
}
