// Half-hour slots: bookings start on the hour or half past. Any other time can
// still be typed into the picker's field.
const TIME_INTERVAL_MINUTES = 30
// Nobody checks in at midnight: an empty picker opens on the working morning.
const DEFAULT_TIME = '09:00'

export const TIME_OPTIONS = Array.from(
  { length: (24 * 60) / TIME_INTERVAL_MINUTES },
  (_, index) => {
    const totalMinutes = index * TIME_INTERVAL_MINUTES
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  },
)

// Convert an HH:mm string into minutes-since-midnight for nearest-option matching.
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

// The option to scroll to on open: the exact value, or the nearest slot to it.
export function nearestOption(value?: string): string {
  if (!value) return DEFAULT_TIME
  if (TIME_OPTIONS.includes(value)) return value
  const target = toMinutes(value)
  return TIME_OPTIONS.reduce((best, option) =>
    Math.abs(toMinutes(option) - target) < Math.abs(toMinutes(best) - target)
      ? option
      : best,
  )
}
