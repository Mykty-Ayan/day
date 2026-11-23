/** Calendar steps on the API's wall-clock times (2026-11-24T14:00:00), with no time zone. */

/** Nights between two calendar days of the API's wall-clock times. */
export function nightsOf(checkIn: string, checkOut: string): number {
  const day = (value: string) => {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((day(checkOut) - day(checkIn)) / 86_400_000)
}

/** The next day at the same wall-clock time, as the API writes it: 2026-11-24T14:00:00. */
export function nextDay(checkIn: string): string {
  const [day, time = '14:00:00'] = checkIn.split('T')
  const [year, month, date] = day.split('-').map(Number)
  const [hour, minute, second = 0] = time.split(':').map(Number)
  // UTC maths only to step the calendar; the result stays a local wall-clock time.
  return new Date(Date.UTC(year, month - 1, date + 1, hour, minute, second)).toISOString().slice(0, 19)
}
