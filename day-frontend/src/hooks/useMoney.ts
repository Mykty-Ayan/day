import { useTranslation } from 'react-i18next'
import { formatMoneyExact } from '../pages/miniapp/format'
import { useCurrency } from './useCurrency'

/** "57 000 ₸": the number in the language's digits, the company's sign after it, kopecks when there are. */
export function useMoney() {
  const { i18n } = useTranslation()
  const { symbol } = useCurrency()
  return (value: number | string) => `${formatMoneyExact(Number(value), i18n.language)} ${symbol}`
}
