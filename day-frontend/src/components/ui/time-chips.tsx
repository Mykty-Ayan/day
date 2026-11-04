import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const hours = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${String(from + i).padStart(2, '0')}:00`)

/** The hours a guest usually arrives at or leaves by. */
export const CHECK_IN_TIMES = hours(10, 22)
export const CHECK_OUT_TIMES = hours(8, 16)

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
// The server reads a daily 00:00 as a bare date and puts the flat's hours instead
// (apply_default_times), so midnight is not taken. Telling the two apart in the API lifts this.

/** A time picked with one press from the usual hours; any other one typed as HH:MM. */
export default function TimeChips({
  id,
  value,
  onChange,
  options,
  labelledBy,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  options: string[]
  labelledBy: string
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
          if (TIME.test(typed) && typed !== '00:00') onChange(typed)
        }}
        className={`h-9 w-[5.5rem] rounded-lg border px-2 text-sm tabular-nums outline-none placeholder:text-ink-muted focus:border-accent ${
          custom ? 'border-accent bg-accent-soft font-semibold text-accent-ink' : 'border-line bg-surface-card text-ink'
        }`}
      />
    </div>
  )
}
