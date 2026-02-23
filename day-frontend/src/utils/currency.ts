const CURRENCY_SYMBOLS: Record<string, string> = {
  KZT: '₸',
  USD: '$',
  EUR: '€',
  RUB: '₽',
}

export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] || currency
}

export function formatCurrency(
  value: number | string,
  currency: string,
  digits = 2,
): string {
  const num = typeof value === 'string' ? parseFloat(value) || 0 : value || 0
  const symbol = getCurrencySymbol(currency)
  return `${symbol}${num.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
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
