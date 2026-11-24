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

/** "27 тыс. ₸", "1,2 млн ₸": the short word of the app's language, the sign after it. */
export function formatCurrencyCompact(
  value: number | string,
  currency: string,
  language: string = i18next.language || 'ru',
): string {
  const num = typeof value === 'string' ? parseFloat(value) || 0 : value || 0
  const text = new Intl.NumberFormat(language === 'kz' ? 'kk' : language, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(num)
  return `${text}\u00a0${getCurrencySymbol(currency)}`
}

/** "432 980 ₸": whole money, for a chip or a list line. */
export function formatCurrencyChip(
  value: number | string,
  currency: string,
  language: string = i18next.language || 'ru',
): string {
  return formatCurrency(value, currency, 0, language)
}
