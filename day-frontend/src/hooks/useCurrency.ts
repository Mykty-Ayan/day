import { useSettings } from './useSettings'
import {
  getCurrencySymbol,
  formatCurrency,
  formatCurrencyCompact,
  formatCurrencyChip,
} from '../utils/currency'

export function useCurrency() {
  const { data: settings } = useSettings()
  const currency = settings?.default_currency || 'KZT'
  const symbol = getCurrencySymbol(currency)

  return {
    currency,
    symbol,
    format: (value: number | string, digits?: number) =>
      formatCurrency(value, currency, digits),
    formatCompact: (value: number | string) =>
      formatCurrencyCompact(value, currency),
    formatChip: (value: number | string) =>
      formatCurrencyChip(value, currency),
  }
}
