import { motion } from 'framer-motion'
import {
  DollarSign,
  TrendingUp,
  CalendarDays,
  BarChart3,
  Building2,
  Percent,
} from 'lucide-react'
import type { AnalyticsSummary } from '../../types/analytics'

const cards = [
  {
    key: 'revenue',
    label: 'Revenue',
    icon: DollarSign,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    format: (s: AnalyticsSummary) => `$${s.total_revenue.toLocaleString()}`,
  },
  {
    key: 'profit',
    label: 'Profit',
    icon: TrendingUp,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    format: (s: AnalyticsSummary) => `$${s.total_profit.toLocaleString()}`,
  },
  {
    key: 'bookings',
    label: 'Bookings',
    icon: CalendarDays,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    format: (s: AnalyticsSummary) => s.total_bookings.toString(),
  },
  {
    key: 'occupancy',
    label: 'Occupancy',
    icon: Percent,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    format: (s: AnalyticsSummary) => `${Number(s.overall_occupancy_rate).toFixed(1)}%`,
  },
  {
    key: 'adr',
    label: 'ADR',
    icon: BarChart3,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    format: (s: AnalyticsSummary) => `$${Number(s.overall_adr).toFixed(0)}`,
  },
  {
    key: 'properties',
    label: 'Properties',
    icon: Building2,
    color: 'text-gray-600',
    bg: 'bg-gray-50',
    format: (s: AnalyticsSummary) => s.properties_count.toString(),
  },
] as const

export default function SummaryCards({ summary }: { summary: AnalyticsSummary }) {
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
