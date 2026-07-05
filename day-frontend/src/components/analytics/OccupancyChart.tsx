import { useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { TimeSeriesPoint } from '../../types/analytics'

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

function formatAxisLabel(label: string): string {
  const trimmed = label.trim()
  if (trimmed.includes('–')) {
    return trimmed.split('–')[0].trim()
  }
  return trimmed
}

export default function OccupancyChart({ data }: { data: TimeSeriesPoint[] }) {
  const { t } = useTranslation()
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const clampedActiveIndex =
    activeIndex !== null && activeIndex < data.length ? activeIndex : null

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
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
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
      <h3 className="text-sm font-bold text-gray-900 mb-4">{t('analytics.occupancyRate')}</h3>
      {!hasOccupancyData ? (
        <div className="flex h-36 items-center justify-center text-sm text-gray-400">
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
                aria-label={`${point.period_label}: ${rate.toFixed(1)}%`}
              >
                <div
                  className={`absolute bottom-full mb-2 z-10 ${
                    isActive ? 'block' : 'hidden group-hover:block group-focus-visible:block'
                  }`}
                >
                  <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                    <div className="font-bold">{rate.toFixed(1)}%</div>
                    <div className="text-gray-300">{+Number(point.booked_nights).toFixed(2)} nights</div>
                    <div className="text-gray-300">{point.period_label}</div>
                  </div>
                </div>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ duration: 0.5, delay: i * 0.03 }}
                  className={`w-full min-h-[2px] cursor-pointer rounded-t-md transition-opacity hover:opacity-80 ${
                    rate >= 80
                      ? 'bg-emerald-500'
                      : rate >= 50
                        ? 'bg-amber-500'
                        : 'bg-red-400'
                  }`}
                />
              </button>
            )
          })}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400">
        {tickIndices.map((index) => (
          <span key={`occupancy-tick-${index}`} className="whitespace-nowrap">
            {formatAxisLabel(data[index]?.period_label ?? '')}
          </span>
        ))}
      </div>
    </div>
  )
}
