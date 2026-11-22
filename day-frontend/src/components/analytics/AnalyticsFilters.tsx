import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
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
  source: string
  onSourceChange: (source: string) => void
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
  source,
  onSourceChange,
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
    { value: 'all', label: t('common.allSources') },
    { value: 'direct', label: t('common.direct') },
    { value: 'booking', label: t('common.bookingCom') },
    { value: 'airbnb', label: t('common.airbnb') },
    { value: 'other', label: t('common.other') },
    { value: 'crm', label: t('bookings.sources.crm') },
    { value: 'offer', label: t('bookings.sources.offer') },
    { value: 'site', label: t('bookings.sources.site') },
  ]

  const selectedProperties = properties.filter((p) => propertyIds.includes(p.id))
  const propertyLabel =
    selectedProperties.length === 0
      ? t('common.allProperties')
      : selectedProperties.length === 1
        ? selectedProperties[0].internal_name
        : t('analytics.propertiesCount', { count: selectedProperties.length })
  const propertyTitle =
    selectedProperties.length <= 1
      ? propertyLabel
      : selectedProperties.map((p) => p.internal_name).join(', ')

  const isAllSelected = propertyIds.length === 0

  const toggleProperty = (id: string) => {
    if (propertyIds.includes(id)) {
      onPropertyChange(propertyIds.filter((pid) => pid !== id))
      return
    }
    onPropertyChange([...propertyIds, id])
  }

  const clearProperties = () => onPropertyChange([])

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
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
 'flex h-11 w-full items-center justify-between rounded-xl border border-line bg-surface-page px-3 py-2 text-sm text-ink',
                'focus:outline-none focus:border-accent',
                'sm:w-56',
              )}
              title={propertyTitle}
            >
              <span className="truncate">{propertyLabel}</span>
              <ChevronDown className="h-4 w-4 text-ink-muted" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="max-h-64 overflow-auto">
              <label
                htmlFor="analytics-all-properties"
                className={cn(
 'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink',
                  'hover:bg-surface-page',
                )}
              >
                <Checkbox
                  id="analytics-all-properties"
                  checked={isAllSelected}
                  onCheckedChange={(checked) => {
                    if (checked) clearProperties()
                  }}
                />
                <span className="truncate">{t('common.allProperties')}</span>
              </label>

              <div className="my-1 h-px bg-surface-page" />

              {properties.length === 0 ? (
                <div className="px-2 py-2 text-sm text-ink-muted">
                  {t('analytics.noPropertiesAvailable')}
                </div>
              ) : (
                properties.map((p) => {
                  const checked = propertyIds.includes(p.id)
                  return (
                    <label
                      key={p.id}
                      htmlFor={`analytics-property-${p.id}`}
                      className={cn(
 'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink',
                        'hover:bg-surface-page',
                      )}
                    >
                      <Checkbox
                        id={`analytics-property-${p.id}`}
                        checked={checked}
                        onCheckedChange={() => toggleProperty(p.id)}
                      />
                      <span className="truncate">{p.internal_name}</span>
                    </label>
                  )
                })
              )}
            </div>
          </PopoverContent>
        </Popover>

        <Select value={source} onValueChange={onSourceChange}>
          <SelectTrigger aria-label={t('bookings.source')} className="w-full sm:w-44">
            <SelectValue placeholder={t('common.allSources')} />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
