import { ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'

interface NumberInputProps {
  id?: string
  value: string | number
  onChange: (value: string) => void
  min?: number
  max?: number
  step?: number
  placeholder?: string
  className?: string
  inputClassName?: string
  disabled?: boolean
  ariaLabel?: string
}

function parseNumber(value: string | number): number | null {
  if (value === '' || value === null || value === undefined) return null
  const normalized = String(value).replace(/\s+/g, '').replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function getStepDecimals(step: number): number {
  const stepStr = String(step)
  if (!stepStr.includes('.')) return 0
  return stepStr.split('.')[1]?.length ?? 0
}

function formatWithStep(value: number, step: number): string {
  const decimals = getStepDecimals(step)
  if (decimals === 0) return String(Math.round(value))
  return value.toFixed(decimals)
}

export default function NumberInput({
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder,
  className,
  inputClassName,
  disabled,
  ariaLabel,
}: NumberInputProps) {
  const { t } = useTranslation()

  function clampValue(num: number): number {
    let next = num
    if (typeof min === 'number') next = Math.max(min, next)
    if (typeof max === 'number') next = Math.min(max, next)
    return next
  }

  function handleStep(direction: 1 | -1) {
    if (disabled) return
    const current = parseNumber(value)
    if (current === null) {
      let initial: number
      if (direction === 1) {
        // For empty values, increment should start from a meaningful first step,
        // not from 0 when min is zero (e.g. amount inputs).
        initial = typeof min === 'number' && min > 0 ? min : step
      } else {
        initial = typeof min === 'number' ? min : -step
      }
      onChange(formatWithStep(clampValue(initial), step))
      return
    }

    const next = clampValue(current + direction * step)
    onChange(formatWithStep(next, step))
  }

  function handleBlur() {
    const current = parseNumber(value)
    if (current === null) return
    const clamped = clampValue(current)
    if (clamped !== current) {
      onChange(formatWithStep(clamped, step))
    }
  }

  return (
    <div className={cn('relative', className)}>
      <input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn(
          'number-input w-full bg-gray-50 border border-gray-200 rounded-xl p-3 pr-11 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm',
          disabled && 'opacity-50 cursor-not-allowed',
          inputClassName,
        )}
      />
      {/* Flush spinner: two half-height segments sized to the input so the
          controls sit inside the field instead of overflowing it. */}
      <div className="absolute right-1.5 top-1.5 bottom-1.5 flex w-7 flex-col overflow-hidden rounded-lg border border-gray-200">
        <button
          type="button"
          onClick={() => handleStep(1)}
          disabled={disabled}
          className="flex flex-1 items-center justify-center bg-white text-gray-500 hover:bg-gray-100 disabled:opacity-40"
          aria-label={t('common.increment')}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => handleStep(-1)}
          disabled={disabled}
          className="flex flex-1 items-center justify-center border-t border-gray-200 bg-white text-gray-500 hover:bg-gray-100 disabled:opacity-40"
          aria-label={t('common.decrement')}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
