import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { endAfterStart, hourlyLengths, lengthEnd, type HourlyEnd, type HourlyLength } from '../../lib/booking-edit'
import type { PricingConfig } from '../../types/property'
import TimeChips from '../ui/time-chips'

const LABEL = 'mb-1.5 block text-xs font-bold text-ink-muted'
const ERROR = 'mt-1 text-xs text-danger'
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
/** When an hourly stay usually starts. */
const START_TIMES = Array.from({ length: 16 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`)

/** An hourly stay picked as a start and a length (the flat's tariffs), not two lists of
 *  times: the owner sells 3 h, 6 h and the night. An end before the start is the next day. */
export default function HourlyTimes({
  idPrefix,
  start,
  end,
  onChange,
  pricing,
  errors = {},
}: {
  idPrefix: string
  start: string
  end: string
  /** Both ends at once: a new start moves the end with it. */
  onChange: (next: { start: string; end: string }) => void
  pricing?: PricingConfig | null
  errors?: { start?: string; end?: string }
}) {
  const { t } = useTranslation()
  const lengths = hourlyLengths(pricing ?? undefined)
  const label = (length: HourlyLength) =>
    length.kind === 'night' ? t('bookings.lengthNight') : t('bookings.lengthHours', { n: length.hours })
  // What sets the end, kept apart from the end itself: a typed end that happens to equal
  // a length's end is still typed, and a length stays picked while the start is typed.
  const [by, setBy] = useState<HourlyEnd | null>(() => {
    const length = lengths.find((l) => start && lengthEnd(start, l) === end)
    return length ? { by: 'length', length } : end ? { by: 'time' } : null
  })
  const pickedKey = by?.by === 'length' ? label(by.length) : null
  const custom = by?.by === 'time'
  const [other, setOther] = useState(custom ? end : '')

  return (
    <>
      <div>
        <span id={`${idPrefix}-start-label`} className={LABEL}>{t('bookings.startTime')}</span>
        <TimeChips
          id={`${idPrefix}-start`}
          labelledBy={`${idPrefix}-start-label`}
          options={START_TIMES}
          value={start}
          allowMidnight
          onChange={(value) => {
            // The length stays as it was picked: the end moves with the start.
            onChange({ start: value, end: by ? endAfterStart(by, value, end) : end })
          }}
        />
        {errors.start && <p className={ERROR}>{errors.start}</p>}
      </div>
      <div>
        <span id={`${idPrefix}-length-label`} className={LABEL}>{t('bookings.lengthLabel')}</span>
        <div id={`${idPrefix}-length`} role="group" aria-labelledby={`${idPrefix}-length-label`} className="flex flex-wrap gap-1.5">
          {lengths.map((length) => {
            const until = start ? lengthEnd(start, length) : ''
            const on = pickedKey === label(length)
            return (
              <button
                key={label(length)}
                type="button"
                aria-pressed={on}
                disabled={!start}
                onClick={() => {
                  setOther('')
                  setBy({ by: 'length', length })
                  onChange({ start, end: until })
                }}
                className={`flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-semibold transition-colors disabled:opacity-40 ${
                  on ? 'bg-accent text-white' : 'border border-line text-ink hover:bg-surface-page'
                }`}
              >
                {label(length)}
                {until && <span className={`font-normal tabular-nums ${on ? 'text-white/80' : 'text-ink-muted'}`}>· {t('bookings.until', { time: until })}</span>}
              </button>
            )
          })}
          <input
            value={other}
            inputMode="numeric"
            maxLength={5}
            placeholder={t('bookings.untilOther')}
            aria-label={t('bookings.untilOther')}
            onChange={(e) => {
              const typed = e.target.value.replace(/^(\d{2})(\d{2})$/, '$1:$2')
              setOther(typed)
              setBy({ by: 'time' })
              onChange({ start, end: typed })
            }}
            className={`h-9 w-[6.5rem] rounded-lg border px-2 text-sm tabular-nums outline-none placeholder:text-ink-muted focus:border-accent ${
              !custom
                ? 'border-line bg-surface-card text-ink'
                : TIME.test(end)
                  ? 'border-accent bg-accent-soft font-semibold text-accent-ink'
                  : 'border-danger bg-danger-soft text-danger'
            }`}
          />
        </div>
        {errors.end && <p className={ERROR}>{errors.end}</p>}
      </div>
    </>
  )
}
