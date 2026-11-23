import { useTranslation } from 'react-i18next'
import { useCurrency } from '../../hooks/useCurrency'
import { formatMoneyExact as formatMoney } from '../../pages/miniapp/format'

export type QuickAmount = { label: string; value: number }

/** Ready sums under an amount field: one tap fills it. Zero and repeated sums are left out. */
export default function QuickAmounts({
  options,
  value,
  onPick,
}: {
  options: QuickAmount[]
  value: number
  onPick: (value: number) => void
}) {
  const { i18n } = useTranslation()
  const { symbol } = useCurrency()
  const shown = options.filter((option, i, all) => option.value > 0 && all.findIndex((o) => o.value === option.value) === i)
  if (shown.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {shown.map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => onPick(option.value)}
          aria-pressed={value === option.value}
          className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-page aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-ink"
        >
          {option.label} · {formatMoney(option.value, i18n.language)} {symbol}
        </button>
      ))}
    </div>
  )
}
