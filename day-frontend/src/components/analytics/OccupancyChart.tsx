import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { TimeSeriesPoint } from '../../types/analytics'
import { dateLocale } from '../../lib/date-locale'
import { periodLabel } from './period-label'
import { intlLocale } from '../../pages/miniapp/format'

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


export default function OccupancyChart({ data }: { data: TimeSeriesPoint[] }) {
  const { t, i18n } = useTranslation()
  const locale = dateLocale(i18n.language)
  const percent = (rate: number) => `${rate.toLocaleString(intlLocale(i18n.language), { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
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

  const rawRates = data.map((point) => {
    const value = Number(point.occupancy_rate)
    return Number.isFinite(value) && value > 0 ? value : 0
  })

  const looksLikeFraction = rawRates.some((rate) => rate > 0) && Math.max(...rawRates) <= 1
  const occupancyRates = rawRates.map((rate) => {
    const normalized = looksLikeFraction ? rate * 100 : rate
    return Math.min(Math.max(normalized, 0), 100)
  })

  const hasOccupancyData = occupancyRates.some((rate) => rate > 0)
  const tickIndices = buildTickIndices(data.length)

  return (
    <div className="bg-surface-card border border-line rounded-xl p-5">
      <h3 className="text-sm font-bold text-ink mb-4">{t('analytics.occupancyRate')}</h3>
      {!hasOccupancyData ? (
        <div className="flex h-36 items-center justify-center text-sm text-ink-muted">
          {t('analytics.noOccupancyData')}
        </div>
      ) : (
        <div className="flex h-36 items-end gap-1">
          {data.map((point, i) => {
            const rate = occupancyRates[i] ?? 0
            const height = Math.max(rate, 2)
            const isActive = clampedActiveIndex === i
            return (
              <button
                key={`${point.period_start ?? point.period_label}-${i}`}
                type="button"
                onClick={() => setActiveIndex((current) => (current === i ? null : i))}
                onFocus={() => setActiveIndex(i)}
                className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end focus:outline-none"
                aria-label={`${periodLabel(point, locale)}: ${percent(rate)}`}
              >
                <div
                  className={`absolute bottom-full mb-2 z-10 ${
                    isActive ? 'block' : 'hidden group-hover:block group-focus-visible:block'
                  }`}
                >
                  <div className="bg-ink text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap">
                    <div className="font-bold">{percent(rate)}</div>
                    <div className="text-white/70">{t('analytics.nightsTaken', { nights: Number(point.booked_nights).toLocaleString(intlLocale(i18n.language), { maximumFractionDigits: 2 }) })}</div>
                    <div className="text-white/70">{periodLabel(point, locale)}</div>
                  </div>
                </div>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ duration: 0.5, delay: i * 0.03 }}
                  // One hue: the height tells the rate, a colour per band would only add a legend to learn.
                  className="w-full min-h-[2px] cursor-pointer rounded-t-md bg-accent transition-opacity hover:opacity-80"
                />
              </button>
            )
          })}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-[10px] text-ink-muted">
        {tickIndices.map((index) => (
          <span key={`occupancy-tick-${index}`} className="whitespace-nowrap">
            {data[index] ? periodLabel(data[index], locale) : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
