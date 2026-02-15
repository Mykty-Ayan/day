import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import type { PeriodPreset, Granularity } from '../../types/analytics'
import type { Property } from '../../types/property'
import { Checkbox } from '../ui/checkbox'
import { cn } from '../../lib/utils'
import { ChevronDown, Download } from 'lucide-react'
import { motion } from 'framer-motion'

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
]

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
]

const SOURCE_OPTIONS = [
  { value: 'all', label: 'All Sources' },
  { value: 'direct', label: 'Direct' },
  { value: 'booking', label: 'Booking.com' },
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'other', label: 'Other' },
]

interface Props {
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
  properties,
  onExport,
}: Props) {
  const selectedProperties = properties.filter((p) => propertyIds.includes(p.id))
  const propertyLabel =
    selectedProperties.length === 0
      ? 'All Properties'
      : selectedProperties.length === 1
        ? selectedProperties[0].internal_name
        : `${selectedProperties.length} properties`
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

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex h-11 w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 shadow-sm',
                'focus:outline-none focus:ring-2 focus:ring-black/10',
                'sm:w-56',
              )}
              title={propertyTitle}
            >
              <span className="truncate">{propertyLabel}</span>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="max-h-64 overflow-auto">
              <label
                htmlFor="analytics-all-properties"
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-gray-700',
                  'hover:bg-gray-100',
                )}
              >
                <Checkbox
                  id="analytics-all-properties"
                  checked={isAllSelected}
                  onCheckedChange={(checked) => {
                    if (checked) clearProperties()
                  }}
                />
                <span className="truncate">All Properties</span>
              </label>

              <div className="my-1 h-px bg-gray-100" />

              {properties.length === 0 ? (
                <div className="px-2 py-2 text-sm text-gray-400">
                  No properties available
                </div>
              ) : (
                properties.map((p) => {
                  const checked = propertyIds.includes(p.id)
                  return (
                    <label
                      key={p.id}
                      htmlFor={`analytics-property-${p.id}`}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-gray-700',
                        'hover:bg-gray-100',
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
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All Sources" />
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
          className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl px-4 py-2 text-sm font-semibold text-gray-700 transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </motion.button>
      </div>
    </div>
  )
}
