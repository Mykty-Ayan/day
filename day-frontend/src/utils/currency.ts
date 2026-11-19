import i18next from 'i18next'

const CURRENCY_SYMBOLS: Record<string, string> = {
  KZT: '₸',
  USD: '$',
  EUR: '€',
  RUB: '₽',
}

export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] || currency
}

/** "432 980 ₸", "1 250,50 ₸": digits grouped in the app's language, kopecks only when there are,
 *  the sign after the number (the Day dictionary). `language` defaults to the app's own. */
export function formatCurrency(
  value: number | string,
  currency: string,
  digits = 2,
  language: string = i18next.language || 'ru',
): string {
  const num = typeof value === 'string' ? parseFloat(value) || 0 : value || 0
  const symbol = getCurrencySymbol(currency)
  const whole = Math.round(num * 10 ** digits) % 10 ** digits === 0
  const text = num.toLocaleString(language === 'kz' ? 'kk' : language, {
    minimumFractionDigits: whole ? 0 : digits,
    maximumFractionDigits: digits,
  })
  return `${text}\u00a0${symbol}`
}

export function formatCurrencyCompact(
  value: number | string,
  currency: string,
): string {
  const num = typeof value === 'string' ? parseFloat(value) || 0 : value || 0
  const symbol = getCurrencySymbol(currency)
  const abs = Math.abs(num)
  if (abs >= 1_000_000) {
    const v = num / 1_000_000
    return `${symbol}${Number.isInteger(v) ? v : v.toFixed(1)}m`
  }
  if (abs >= 1_000) {
    const v = num / 1_000
    return `${symbol}${Number.isInteger(v) ? v : v.toFixed(1)}k`
  }
  return `${symbol}${Math.round(num)}`
}

export function formatCurrencyChip(
  value: number | string,
  currency: string,
): string {
  const num = typeof value === 'string' ? parseFloat(value) || 0 : value || 0
  const symbol = getCurrencySymbol(currency)
  return `${symbol}${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}
