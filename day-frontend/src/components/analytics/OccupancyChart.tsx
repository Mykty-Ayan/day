import { motion } from 'framer-motion'
import type { TimeSeriesPoint } from '../../types/analytics'

export default function OccupancyChart({ data }: { data: TimeSeriesPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        No data for the selected period
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
      <h3 className="text-sm font-bold text-gray-900 mb-4">Occupancy Rate</h3>
      <div className="flex items-end gap-1 h-48">
        {data.map((point, i) => {
          const rate = Math.min(Number(point.occupancy_rate), 100)
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end gap-1 group relative"
            >
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                  <div className="font-bold">{rate.toFixed(1)}%</div>
                  <div className="text-gray-300">{point.booked_nights} nights</div>
                  <div className="text-gray-300">{point.period_label}</div>
                </div>
              </div>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(rate, 2)}%` }}
                transition={{ duration: 0.5, delay: i * 0.03 }}
                className={`w-full rounded-t-md hover:opacity-80 transition-opacity cursor-pointer min-h-[2px] ${
                  rate >= 80
                    ? 'bg-emerald-500'
                    : rate >= 50
                      ? 'bg-amber-500'
                      : 'bg-red-400'
                }`}
              />
              {data.length <= 31 && (
                <span className="text-[9px] text-gray-400 truncate w-full text-center">
                  {point.period_label}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
