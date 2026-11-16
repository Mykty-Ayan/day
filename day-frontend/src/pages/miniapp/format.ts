/** Formatting and date maths for the Mini App. Kept out of the component
 *  module so fast refresh stays reliable there. */

/** The app calls Kazakh "kz"; Intl knows it as "kk" and silently falls back to en-US otherwise. */
export function intlLocale(language: string): string {
  return language === 'kz' ? 'kk' : language
}

export function formatMoney(value: number, language: string): string {
  return new Intl.NumberFormat(intlLocale(language), { maximumFractionDigits: 0 }).format(value)
}

/** A price in a box too narrow for the whole of it: in thousands from a thousand up, «15»,
 *  «1,5», and the caller adds the word for them («тыс.», «мың»). Not Intl's compact notation:
 *  Chrome writes Kazakh thousands as a Latin «K». */
export function formatMoneyShort(value: number, language: string): { amount: string; thousands: boolean } {
  if (value < 1000) return { amount: formatMoney(value, language), thousands: false }
  const short = value / 1000
  const amount = new Intl.NumberFormat(intlLocale(language), { maximumFractionDigits: short < 10 ? 1 : 0 }).format(short)
  return { amount, thousands: true }
}

/** Kopecks kept: what a confirmation names is what the operation sends. */
export function formatMoneyExact(value: number, language: string): string {
  return new Intl.NumberFormat(intlLocale(language), { maximumFractionDigits: 2 }).format(value)
}

export function formatDay(value: string, language: string): string {
  return new Date(value).toLocaleDateString(intlLocale(language), { day: '2-digit', month: 'short' })
}

export function formatTime(value: string, language: string): string {
  return new Date(value).toLocaleTimeString(intlLocale(language), { hour: '2-digit', minute: '2-digit' })
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
