import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { TimeSeriesPoint } from '../../types/analytics'
import { dateLocale } from '../../lib/date-locale'
import { periodLabel } from './period-label'
import { useCurrency } from '../../hooks/useCurrency'

function buildTickIndices(length: number, maxTicks = 6): number[] {
  if (length <= maxTicks) {
    return Array.from({ length }, (_, i) => i)
  }

  const step = Math.ceil((length - 1) / (maxTicks - 1))
  const indices = Array.from({ length: maxTicks }, (_, i) =>
    Math.min(i * step, length - 1),
  )
  return [...new Set(indices)]
}


export default function RevenueChart({ data }: { data: TimeSeriesPoint[] }) {
  const { t, i18n } = useTranslation()
  const locale = dateLocale(i18n.language)
  const { format: money } = useCurrency()
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const clampedActiveIndex =
    activeIndex !== null && activeIndex < data.length ? activeIndex : null

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-ink-muted">
        {t('analytics.noData')}
      </div>
    )
  }

  const revenueValues = data.map((point) => {
    const value = Number(point.revenue)
    return Number.isFinite(value) && value > 0 ? value : 0
  })

  const maxRevenue = Math.max(...revenueValues, 0)
  const hasRevenueData = maxRevenue > 0
  const tickIndices = buildTickIndices(data.length)

  return (
    <div className="bg-surface-card border border-line rounded-xl p-5">
      <h3 className="text-sm font-bold text-ink mb-4">{t('analytics.revenue')}</h3>
      {!hasRevenueData ? (
        <div className="flex h-36 items-center justify-center text-sm text-ink-muted">
          {t('analytics.noRevenueData')}
        </div>
      ) : (
        <div className="flex h-36 items-end gap-1">
          {data.map((point, i) => {
            const value = revenueValues[i] ?? 0
            const height = Math.min(Math.max((value / maxRevenue) * 100, 2), 100)
            const isActive = clampedActiveIndex === i
            return (
              <button
                key={`${point.period_start ?? point.period_label}-${i}`}
                type="button"
                onClick={() => setActiveIndex((current) => (current === i ? null : i))}
                onFocus={() => setActiveIndex(i)}
                className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end focus:outline-none"
                aria-label={`${periodLabel(point, locale)}: ${money(value)}`}
              >
                <div
                  className={`absolute bottom-full mb-2 z-10 ${
                    isActive ? 'block' : 'hidden group-hover:block group-focus-visible:block'
                  }`}
                >
                  <div className="bg-ink text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap">
                    <div className="font-bold">{money(value)}</div>
                    <div className="text-white/70">
                      {t('analytics.bookingsCount', { count: point.bookings_count })}
                    </div>
                    <div className="text-white/70">{periodLabel(point, locale)}</div>
                  </div>
                </div>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ duration: 0.5, delay: i * 0.03 }}
                  className="w-full min-h-[2px] cursor-pointer rounded-t-md bg-accent transition-colors hover:bg-accent-hover"
                />
              </button>
            )
          })}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-[10px] text-ink-muted">
        {tickIndices.map((index) => (
          <span key={`revenue-tick-${index}`} className="whitespace-nowrap">
            {data[index] ? periodLabel(data[index], locale) : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
