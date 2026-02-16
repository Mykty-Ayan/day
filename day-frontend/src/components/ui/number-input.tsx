import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../../lib/utils'

interface NumberInputProps {
  value: string | number
  onChange: (value: string) => void
  min?: number
  max?: number
  step?: number
  placeholder?: string
  className?: string
  inputClassName?: string
  disabled?: boolean
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
  value,
  onChange,
  min,
  max,
  step = 1,
  placeholder,
  className,
  inputClassName,
  disabled,
}: NumberInputProps) {
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
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'number-input w-full bg-gray-50 border border-gray-200 rounded-xl p-3 pr-9 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm',
          disabled && 'opacity-50 cursor-not-allowed',
          inputClassName,
        )}
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => handleStep(1)}
          disabled={disabled}
          className="h-4 w-4 rounded-md bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          aria-label="Increment"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => handleStep(-1)}
          disabled={disabled}
          className="h-4 w-4 rounded-md bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          aria-label="Decrement"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}
