import { motion } from 'framer-motion'
import {
  DollarSign,
  TrendingUp,
  CalendarDays,
  BarChart3,
  Building2,
  Percent,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AnalyticsSummary } from '../../types/analytics'
import { useCurrency } from '../../hooks/useCurrency'

const formatNumber = (
  value: number | string,
  options?: Intl.NumberFormatOptions,
) => Number(value || 0).toLocaleString(undefined, options)

const formatPercent = (value: number | string, digits = 1) =>
  `${formatNumber(value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`

function getCards(t: (key: string) => string, currencyFormat: (v: number | string, d?: number) => string) {
  return [
    {
      key: 'revenue',
      label: t('analytics.revenue'),
      icon: DollarSign,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      format: (s: AnalyticsSummary) => currencyFormat(s.total_revenue, 2),
    },
    {
      key: 'profit',
      label: t('analytics.profit'),
      icon: TrendingUp,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      format: (s: AnalyticsSummary) => currencyFormat(s.total_profit, 2),
    },
    {
      key: 'bookings',
      label: t('analytics.bookings'),
      icon: CalendarDays,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      format: (s: AnalyticsSummary) => formatNumber(s.total_bookings),
    },
    {
      key: 'occupancy',
      label: t('analytics.occupancy'),
      icon: Percent,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      format: (s: AnalyticsSummary) => formatPercent(s.overall_occupancy_rate, 1),
    },
    {
      key: 'adr',
      label: t('analytics.adr'),
      icon: BarChart3,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      format: (s: AnalyticsSummary) => currencyFormat(s.overall_adr, 0),
    },
    {
      key: 'properties',
      label: t('analytics.properties'),
      icon: Building2,
      color: 'text-gray-600',
      bg: 'bg-gray-50',
      format: (s: AnalyticsSummary) => formatNumber(s.properties_count),
    },
  ]
}

export default function SummaryCards({ summary }: { summary: AnalyticsSummary }) {
  const { t } = useTranslation()
  const { format: currencyFormat } = useCurrency()
  const cards = getCards(t, currencyFormat)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((card, i) => (
        <motion.div
          key={card.key}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.05 }}
          className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-7 h-7 rounded-lg ${card.bg} flex items-center justify-center`}>
              <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {card.label}
            </span>
          </div>
          <div className="text-lg font-bold text-gray-900">{card.format(summary)}</div>
        </motion.div>
      ))}
    </div>
  )
}
