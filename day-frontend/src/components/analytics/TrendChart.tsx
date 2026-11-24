import { useId, useState } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TimeSeriesPoint } from '../../types/analytics'
import { dateLocale } from '../../lib/date-locale'
import { changeOf, niceTop } from '../../pages/analytics/period'
import { periodLabel } from './period-label'

const TICKS = 6

/** Where the date labels go: the first, the last and evenly between, at most six. */
function tickIndices(length: number): number[] {
  if (length <= TICKS) return Array.from({ length }, (_, i) => i)
  const step = (length - 1) / (TICKS - 1)
  return [...new Set(Array.from({ length: TICKS }, (_, i) => Math.round(i * step)))]
}

type Props = {
  title: string
  data: TimeSeriesPoint[]
  /** The period just before, as long: drawn dashed under this one, day by day. */
  previous?: TimeSeriesPoint[]
  value: (point: TimeSeriesPoint) => number
  /** The value in full, for the tooltip. */
  format: (value: number) => string
  /** The value short, for the grid: «100 тыс. ₸». */
  formatAxis: (value: number) => string
  /** A line under the value in the tooltip: the bookings, the nights. */
  detail?: (point: TimeSeriesPoint) => string
  /** The scale's ceiling, if the value has one (a rate stops at 100). */
  cap?: number
  empty: string
  testId: string
}

/** A period day by day as a line, and the period before as a dashed one under it: where
 *  it went up and where down. The grid in round sums; a point tells both values. */
export default function TrendChart({ title, data, previous = [], value, format, formatAxis, detail, cap, empty, testId }: Props) {
  const { t, i18n } = useTranslation()
  const locale = dateLocale(i18n.language)
  const gradient = useId()
  const [active, setActive] = useState<number | null>(null)

  const now = data.map((point) => Math.max(0, value(point) || 0))
  const before = data.map((_, i) => (previous[i] ? Math.max(0, value(previous[i]) || 0) : null))
  const hasPrevious = before.some((v) => v !== null && v > 0)
  const largest = Math.max(...now, ...before.map((v) => v ?? 0), 0)
  const top = cap ? Math.min(niceTop(largest), cap) : niceTop(largest)
  const last = Math.max(data.length - 1, 1)
  // Percent across and down the plot: SVG coordinates and the HTML laid over them agree.
  const x = (i: number) => (data.length === 1 ? 50 : (i / last) * 100)
  const y = (v: number) => 100 - (top ? (Math.min(v, top) / top) * 100 : 0)
  const line = (values: (number | null)[]) =>
    values
      .map((v, i) => (v === null ? null : `${x(i)},${y(v)}`))
      .filter(Boolean)
      .join(' L')

  const shown = active !== null && active < data.length ? active : null

  return (
    <section className="rounded-xl border border-line bg-surface-card p-5" data-testid={testId}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        {hasPrevious && (
          <div className="flex gap-3 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-accent" aria-hidden="true" />
              {t('analytics.thisPeriod')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-ink-muted/60" aria-hidden="true" />
              {t('analytics.previousPeriod')}
            </span>
          </div>
        )}
      </div>

      {top === 0 ? (
        <div className="flex h-44 items-center justify-center text-sm text-ink-muted">{empty}</div>
      ) : (
        <div className="flex gap-2">
          {/* The grid's sums, beside the lines they name. */}
          <div className="relative h-44 w-14 shrink-0 text-right text-[10px] tabular-nums text-ink-muted" aria-hidden="true">
            {[top, top / 2, 0].map((tick, i) => (
              <span key={i} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${i * 50}%` }}>
                {formatAxis(tick)}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative h-44" onMouseLeave={() => setActive(null)}>
              {[0, 50, 100].map((at) => (
                <div key={at} className="absolute inset-x-0 border-t border-line" style={{ top: `${at}%` }} aria-hidden="true" />
              ))}
              <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {hasPrevious && (
                  <path
                    d={`M${line(before)}`}
                    fill="none"
                    stroke="var(--color-ink-muted)"
                    strokeOpacity="0.55"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <path d={`M${x(0)},100 L${line(now)} L${x(data.length - 1)},100 Z`} fill={`url(#${gradient})`} />
                <path
                  d={`M${line(now)}`}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              {shown !== null && (
                <>
                  <div className="pointer-events-none absolute inset-y-0 w-px bg-ink/20" style={{ left: `${x(shown)}%` }} aria-hidden="true" />
                  <span
                    className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-surface-card"
                    style={{ left: `${x(shown)}%`, top: `${y(now[shown])}%` }}
                    aria-hidden="true"
                  />
                  <Tooltip
                    left={x(shown)}
                    value={format(now[shown])}
                    change={before[shown] !== null ? changeOf(now[shown], before[shown]!) : null}
                    detail={detail?.(data[shown])}
                    when={periodLabel(data[shown], locale)}
                    was={
                      hasPrevious && previous[shown] && before[shown] !== null
                        ? `${periodLabel(previous[shown], locale)}: ${format(before[shown]!)}`
                        : null
                    }
                  />
                </>
              )}

              {/* A target per point, wider than the line: hover, tap or Tab tells both values. */}
              {data.map((point, i) => (
                <button
                  key={`${point.period_start ?? point.period_label}-${i}`}
                  type="button"
                  data-testid="trend-point"
                  className="absolute inset-y-0 focus:outline-none"
                  style={{ left: `${data.length === 1 ? 0 : x(i) - 50 / last}%`, width: `${data.length === 1 ? 100 : 100 / last}%` }}
                  aria-label={[
                    `${periodLabel(point, locale)}: ${format(now[i])}`,
                    hasPrevious && previous[i] && before[i] !== null ? `${periodLabel(previous[i], locale)}: ${format(before[i]!)}` : null,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  onClick={() => setActive(i)}
                />
              ))}
            </div>
            <div className="relative mt-2 h-4 text-[10px] text-ink-muted" aria-hidden="true">
              {tickIndices(data.length).map((i, k, ticks) => (
                <span
                  key={i}
                  // A phone has room for three dates: the first, the middle and the last.
                  className={`absolute whitespace-nowrap ${k === 0 || k === ticks.length - 1 || k === Math.floor(ticks.length / 2) ? '' : 'hidden sm:inline'}`}
                  style={{
                    left: `${x(i)}%`,
                    transform: data.length === 1 ? 'translateX(-50%)' : i === 0 ? 'none' : i === data.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                  }}
                >
                  {periodLabel(data[i], locale)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

/** Above the point, kept inside the chart at its edges. */
function Tooltip({
  left,
  value,
  change,
  detail,
  when,
  was,
}: {
  left: number
  value: string
  change: number | null
  detail?: string
  when: string
  was: string | null
}) {
  const rounded = change === null ? null : Math.round(change)
  const Icon = rounded === null || rounded === 0 ? null : rounded > 0 ? ArrowUpRight : ArrowDownRight
  const shift = left < 20 ? '0%' : left > 80 ? '-100%' : '-50%'
  return (
    <div
      className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg bg-ink px-3 py-2 text-xs text-white shadow-lg"
      style={{ left: `${left}%`, transform: `translateX(${shift})` }}
      data-testid="trend-tooltip"
    >
      <div className="flex items-center gap-2">
        <span className="font-bold">{value}</span>
        {rounded !== null && (
          // On the dark tooltip the arrow and the sign say up or down: the tokens' green and red are for light ground.
          <span className="inline-flex items-center font-semibold tabular-nums text-white/85">
            {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
            {`${rounded > 0 ? '+' : ''}${rounded}%`}
          </span>
        )}
      </div>
      {detail && <div className="text-white/70">{detail}</div>}
      <div className="text-white/70">{when}</div>
      {was && (
        <div className="mt-1 flex items-center gap-1.5 border-t border-white/15 pt-1 text-white/70">
          <span className="w-3 border-t-2 border-dashed border-white/50" aria-hidden="true" />
          {was}
        </div>
      )}
    </div>
  )
}
