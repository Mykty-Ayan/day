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
import i18next from 'i18next'
import { intlLocale } from '../../pages/miniapp/format'

// Digits grouped in the app's language, not the browser's.
const formatNumber = (
  value: number | string,
  options?: Intl.NumberFormatOptions,
) => Number(value || 0).toLocaleString(intlLocale(i18next.language || 'ru'), options)

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
      color: 'text-ink-muted',
      bg: 'bg-surface-page',
      format: (s: AnalyticsSummary) => currencyFormat(s.total_revenue, 2),
    },
    {
      key: 'profit',
      label: t('analytics.profit'),
      icon: TrendingUp,
      color: 'text-ink-muted',
      bg: 'bg-surface-page',
      format: (s: AnalyticsSummary) => currencyFormat(s.total_profit, 2),
    },
    {
      key: 'bookings',
      label: t('analytics.bookings'),
      icon: CalendarDays,
      color: 'text-ink-muted',
      bg: 'bg-surface-page',
      format: (s: AnalyticsSummary) => formatNumber(s.total_bookings),
    },
    {
      key: 'occupancy',
      label: t('analytics.occupancy'),
      icon: Percent,
      color: 'text-ink-muted',
      bg: 'bg-surface-page',
      format: (s: AnalyticsSummary) => formatPercent(s.overall_occupancy_rate, 1),
    },
    {
      key: 'adr',
      label: t('analytics.adr'),
      icon: BarChart3,
      color: 'text-ink-muted',
      bg: 'bg-surface-page',
      format: (s: AnalyticsSummary) => currencyFormat(s.overall_adr, 0),
    },
    {
      key: 'properties',
      label: t('analytics.properties'),
      icon: Building2,
      color: 'text-ink-muted',
      bg: 'bg-surface-page',
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
          className="bg-surface-card border border-line rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-7 h-7 rounded-lg ${card.bg} flex items-center justify-center`}>
              <card.icon className={`w-3.5 h-3.5 ${card.color}`} />
            </div>
            <span className="text-[10px] font-bold text-ink-muted">
              {card.label}
            </span>
          </div>
          <div className="text-lg font-bold text-ink">{card.format(summary)}</div>
        </motion.div>
      ))}
    </div>
  )
}
