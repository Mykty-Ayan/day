/** Formatting and date maths for the Mini App. Kept out of the component
 *  module so fast refresh stays reliable there. */

export function formatMoney(value: number, language: string): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(value)
}

export function formatDay(value: string, language: string): string {
  return new Date(value).toLocaleDateString(language, { day: '2-digit', month: 'short' })
}

export function formatTime(value: string, language: string): string {
  return new Date(value).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })
}

export function toISODate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate(),
  ).padStart(2, '0')}`
}

export function addDays(value: Date, days: number): Date {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}
