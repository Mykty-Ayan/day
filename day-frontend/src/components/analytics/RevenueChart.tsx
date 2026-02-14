import { motion } from 'framer-motion'
import type { TimeSeriesPoint } from '../../types/analytics'

export default function RevenueChart({ data }: { data: TimeSeriesPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        No data for the selected period
      </div>
    )
  }

  const maxRevenue = Math.max(...data.map((d) => Number(d.revenue)), 1)

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
      <h3 className="text-sm font-bold text-gray-900 mb-4">Revenue</h3>
      <div className="flex items-end gap-1 h-48">
        {data.map((point, i) => {
          const height = (Number(point.revenue) / maxRevenue) * 100
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end gap-1 group relative"
            >
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                  <div className="font-bold">${Number(point.revenue).toLocaleString()}</div>
                  <div className="text-gray-300">{point.bookings_count} bookings</div>
                  <div className="text-gray-300">{point.period_label}</div>
                </div>
              </div>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(height, 2)}%` }}
                transition={{ duration: 0.5, delay: i * 0.03 }}
                className="w-full bg-emerald-500 rounded-t-md hover:bg-emerald-600 transition-colors cursor-pointer min-h-[2px]"
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
