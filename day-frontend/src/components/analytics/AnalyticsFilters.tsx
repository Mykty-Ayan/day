import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import type { PeriodPreset, Granularity } from '../../types/analytics'
import type { Property } from '../../types/property'
import { Download } from 'lucide-react'
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
  propertyId: string
  onPropertyChange: (id: string) => void
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
  propertyId,
  onPropertyChange,
  source,
  onSourceChange,
  properties,
  onExport,
}: Props) {
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
        <Select value={propertyId} onValueChange={onPropertyChange}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="All Properties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Properties</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.internal_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
