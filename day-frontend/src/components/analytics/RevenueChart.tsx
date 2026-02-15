import { motion } from 'framer-motion'
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

export default function RevenueChart({ data }: { data: TimeSeriesPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        No data for the selected period
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
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
      <h3 className="text-sm font-bold text-gray-900 mb-4">Revenue</h3>
      {!hasRevenueData ? (
        <div className="flex h-36 items-center justify-center text-sm text-gray-400">
          No revenue data for the selected period
        </div>
      ) : (
        <div className="flex h-36 items-end gap-1">
          {data.map((point, i) => {
            const value = revenueValues[i] ?? 0
            const height = Math.min(Math.max((value / maxRevenue) * 100, 2), 100)
            return (
              <div
                key={`${point.period_start ?? point.period_label}-${i}`}
                className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              >
                <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                  <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                    <div className="font-bold">${value.toLocaleString()}</div>
                    <div className="text-gray-300">{point.bookings_count} bookings</div>
                    <div className="text-gray-300">{point.period_label}</div>
                  </div>
                </div>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ duration: 0.5, delay: i * 0.03 }}
                  className="w-full min-h-[2px] cursor-pointer rounded-t-md bg-emerald-500 transition-colors hover:bg-emerald-600"
                />
              </div>
            )
          })}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-[10px] text-gray-400">
        {tickIndices.map((index) => (
          <span key={`revenue-tick-${index}`} className="whitespace-nowrap">
            {formatAxisLabel(data[index]?.period_label ?? '')}
          </span>
        ))}
      </div>
    </div>
  )
}
