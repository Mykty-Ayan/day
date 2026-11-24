import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import DateRangePicker from '../ui/date-range-picker'
import type { PeriodPreset, Granularity } from '../../types/analytics'
import type { Property } from '../../types/property'
import { Checkbox } from '../ui/checkbox'
import { cn } from '../../lib/utils'
import { ChevronDown, Download } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'

interface Props {
  /** The owner's own period, first and last day included; used when period is 'custom'. */
  range: { from: string; to: string }
  onRangeChange: (range: { from: string; to: string }) => void
  period: PeriodPreset
  onPeriodChange: (period: PeriodPreset) => void
  granularity: Granularity
  onGranularityChange: (granularity: Granularity) => void
  propertyIds: string[]
  onPropertyChange: (ids: string[]) => void
  /** The sources picked; none is all of them. */
  sources: string[]
  onSourcesChange: (sources: string[]) => void
  properties: Property[]
  onExport: () => void
  /** No export while the own period is not picked yet. */
  exportDisabled?: boolean
}

export default function AnalyticsFilterBar({
  period,
  onPeriodChange,
  granularity,
  onGranularityChange,
  propertyIds,
  onPropertyChange,
  sources,
  onSourcesChange,
  range,
  onRangeChange,
  properties,
  onExport,
  exportDisabled = false,
}: Props) {
  const { t } = useTranslation()

  const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
    { value: 'week', label: t('analytics.week') },
    { value: 'month', label: t('analytics.month') },
    { value: 'quarter', label: t('analytics.quarter') },
    { value: 'year', label: t('analytics.year') },
    { value: 'custom', label: t('analytics.customPeriod') },
  ]

  const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
    { value: 'day', label: t('analytics.daily') },
    { value: 'week', label: t('analytics.weekly') },
    { value: 'month', label: t('analytics.monthly') },
  ]

  const SOURCE_OPTIONS = [
    { value: 'direct', label: t('common.direct') },
    { value: 'booking', label: t('common.bookingCom') },
    { value: 'airbnb', label: t('common.airbnb') },
    { value: 'other', label: t('common.other') },
    { value: 'crm', label: t('bookings.sources.crm') },
    { value: 'offer', label: t('bookings.sources.offer') },
    { value: 'site', label: t('bookings.sources.site') },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="w-full overflow-x-auto sm:w-auto">
          <ToggleGroup
            type="single"
            value={period}
            onValueChange={(value) => {
              if (value) onPeriodChange(value as PeriodPreset)
            }}
            className="self-start"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <ToggleGroupItem key={opt.value} value={opt.value}>
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {period === 'custom' && (
          <div className="w-full sm:w-64">
            <DateRangePicker
              id="analytics-period"
              startDate={range.from}
              endDate={range.to}
              onRangeChange={(from, to) => onRangeChange({ from, to })}
              placeholder={t('analytics.pickPeriod')}
              allowSameDay
            />
          </div>
        )}

        <div className="w-full overflow-x-auto sm:w-auto">
          <ToggleGroup
            type="single"
            value={granularity}
            onValueChange={(value) => {
              if (value) onGranularityChange(value as Granularity)
            }}
            className="self-start"
          >
            {GRANULARITY_OPTIONS.map((opt) => (
              <ToggleGroupItem key={opt.value} value={opt.value}>
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <ChecksPopover
          name={t('analytics.property')}
          all={t('common.allProperties')}
          many={(count) => t('analytics.propertiesCount', { count })}
          empty={t('analytics.noPropertiesAvailable')}
          idPrefix="analytics-property"
          options={properties.map((p) => ({ value: p.id, label: p.internal_name }))}
          picked={propertyIds}
          onChange={onPropertyChange}
          className="sm:w-56"
        />

        <ChecksPopover
          name={t('bookings.source')}
          all={t('common.allSources')}
          many={(count) => t('analytics.sourcesCount', { count })}
          idPrefix="analytics-source"
          options={SOURCE_OPTIONS}
          picked={sources}
          onChange={onSourcesChange}
          fullIsAll
          className="sm:w-52"
        />

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onExport}
          disabled={exportDisabled}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface-card px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-page disabled:opacity-50 sm:w-auto"
        >
          <Download className="w-4 h-4" />
          {t('analytics.exportCsv')}
        </motion.button>
      </div>
    </div>
  )
}

/** A list to tick: «all» on top, then each option. None ticked is all of them. */
function ChecksPopover({
  name,
  all,
  many,
  empty,
  idPrefix,
  options,
  picked,
  onChange,
  className,
  fullIsAll = false,
}: {
  name: string
  all: string
  many: (count: number) => string
  empty?: string
  idPrefix: string
  options: { value: string; label: string }[]
  picked: string[]
  onChange: (values: string[]) => void
  className?: string
  /** Every option ticked is «all»: for sources, where «all» also counts expenses and bookings
   *  with no source. Not for objects: «all» there takes in the archived ones too. */
  fullIsAll?: boolean
}) {
  const chosen = options.filter((o) => picked.includes(o.value))
  const label = chosen.length === 0 ? all : chosen.length === 1 ? chosen[0].label : many(chosen.length)
  const toggle = (value: string) => {
    const next = picked.includes(value) ? picked.filter((v) => v !== value) : [...picked, value]
    onChange(fullIsAll && next.length === options.length ? [] : next)
  }
  const row = cn('flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink', 'hover:bg-surface-page')

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-label={name}
          className={cn(
            'flex h-11 w-full items-center justify-between rounded-xl border border-line bg-surface-page px-3 py-2 text-sm text-ink',
            'focus:outline-none focus:border-accent',
            className,
          )}
          title={chosen.length > 1 ? chosen.map((o) => o.label).join(', ') : label}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 text-ink-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="max-h-64 overflow-auto">
          <label htmlFor={`${idPrefix}-all`} className={row}>
            <Checkbox
              id={`${idPrefix}-all`}
              checked={picked.length === 0}
              onCheckedChange={(checked) => {
                if (checked) onChange([])
              }}
            />
            <span className="truncate">{all}</span>
          </label>

          <div className="my-1 h-px bg-surface-page" />

          {options.length === 0 && empty ? (
            <div className="px-2 py-2 text-sm text-ink-muted">{empty}</div>
          ) : (
            options.map((o) => (
              <label key={o.value} htmlFor={`${idPrefix}-${o.value}`} className={row}>
                <Checkbox id={`${idPrefix}-${o.value}`} checked={picked.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
                <span className="truncate">{o.label}</span>
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
