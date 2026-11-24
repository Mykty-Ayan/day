import { motion } from 'framer-motion'
import {
  ArrowDownRight,
  ArrowUpRight,
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
import { changeOf } from '../../pages/analytics/period'

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
      value: (s: AnalyticsSummary) => Number(s.total_revenue),
      label: t('analytics.revenue'),
      icon: DollarSign,
      color: 'text-ink-muted',
      bg: 'bg-surface-page',
      format: (s: AnalyticsSummary) => currencyFormat(s.total_revenue, 2),
    },
    {
      key: 'profit',
      value: (s: AnalyticsSummary) => Number(s.total_profit),
      label: t('analytics.profit'),
      icon: TrendingUp,
      color: 'text-ink-muted',
      bg: 'bg-surface-page',
      format: (s: AnalyticsSummary) => currencyFormat(s.total_profit, 2),
    },
    {
      key: 'bookings',
      value: (s: AnalyticsSummary) => Number(s.total_bookings),
      label: t('analytics.bookings'),
      icon: CalendarDays,
      color: 'text-ink-muted',
      bg: 'bg-surface-page',
      format: (s: AnalyticsSummary) => formatNumber(s.total_bookings),
    },
    {
      key: 'occupancy',
      value: (s: AnalyticsSummary) => Number(s.overall_occupancy_rate),
      label: t('analytics.occupancy'),
      icon: Percent,
      color: 'text-ink-muted',
      bg: 'bg-surface-page',
      format: (s: AnalyticsSummary) => formatPercent(s.overall_occupancy_rate, 1),
    },
    {
      key: 'adr',
      value: (s: AnalyticsSummary) => Number(s.overall_adr),
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

/** The six numbers of the period; with the period before, how each changed since. */
export default function SummaryCards({ summary, previous }: { summary: AnalyticsSummary; previous?: AnalyticsSummary }) {
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
          {previous && 'value' in card && card.value && (
            <Change percent={changeOf(card.value(summary), card.value(previous))} before={card.format(previous)} />
          )}
        </motion.div>
      ))}
    </div>
  )
}

/** Up or down since the period before: an arrow and a sign besides the colour, and what it was
 *  for a screen reader. Nothing when there was nothing to compare with. */
function Change({ percent, before }: { percent: number | null; before: string }) {
  const { t } = useTranslation()
  if (percent === null) return <p className="mt-1 text-xs text-ink-muted">{t('analytics.wasBefore', { value: before })}</p>
  const rounded = Math.round(percent)
  const Icon = rounded > 0 ? ArrowUpRight : rounded < 0 ? ArrowDownRight : null
  const tone = rounded > 0 ? 'text-success' : rounded < 0 ? 'text-danger' : 'text-ink-muted'
  return (
    <p className={`mt-1 inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${tone}`} data-testid="analytics-change">
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      {`${rounded > 0 ? '+' : ''}${formatNumber(rounded)}%`}
      <span className="sr-only">{`, ${t('analytics.wasBefore', { value: before })}`}</span>
    </p>
  )
}
