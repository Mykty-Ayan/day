import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isStayTime } from '../../lib/booking-edit'

const hours = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${String(from + i).padStart(2, '0')}:00`)

/** The hours a guest usually arrives at or leaves by. */
export const CHECK_IN_TIMES = hours(10, 22)
export const CHECK_OUT_TIMES = hours(8, 16)


/** A time picked with one press from the usual hours; any other one typed as HH:MM.
 *  What is typed goes to the form as it is, so the form refuses a wrong one (isStayTime)
 *  instead of saving the time picked before it. */
export default function TimeChips({
  id,
  value,
  onChange,
  options,
  labelledBy,
  allowMidnight = false,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  options: string[]
  labelledBy: string
  /** An hourly time: midnight is a real time there, not "no time". */
  allowMidnight?: boolean
}) {
  const { t } = useTranslation()
  const custom = value !== '' && !options.includes(value)
  const [other, setOther] = useState(custom ? value : '')

  return (
    <div id={id} role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-1.5">
      {options.map((time) => (
        <button
          key={time}
          type="button"
          aria-pressed={value === time}
          onClick={() => {
            setOther('')
            onChange(time)
          }}
          className={`h-9 min-w-[3.75rem] rounded-lg px-2 text-sm font-semibold tabular-nums transition-colors ${
            value === time ? 'bg-accent text-white' : 'border border-line text-ink hover:bg-surface-page'
          }`}
        >
          {time}
        </button>
      ))}
      <input
        value={other}
        inputMode="numeric"
        maxLength={5}
        placeholder={t('common.otherTime')}
        aria-label={t('common.otherTime')}
        onChange={(e) => {
          // "1630" is read as "16:30": a phone keypad has no colon.
          const typed = e.target.value.replace(/^(\d{2})(\d{2})$/, '$1:$2')
          setOther(typed)
          onChange(typed)
        }}
        className={`h-9 w-[5.5rem] rounded-lg border px-2 text-sm tabular-nums outline-none placeholder:text-ink-muted focus:border-accent ${
          !custom
            ? 'border-line bg-surface-card text-ink'
            : isStayTime(value) || (allowMidnight && value === '00:00')
              ? 'border-accent bg-accent-soft font-semibold text-accent-ink'
              : 'border-danger bg-danger-soft text-danger'
        }`}
      />
    </div>
  )
}
