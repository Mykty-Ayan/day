import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Spinner from '../ui/Spinner'
import { useAmenities } from '../../hooks/useProperties'
import type { AmenityCategory } from '../../types/property'
import { Checkbox } from '../ui/checkbox'

interface Props {
  selectedIds: string[]
  /** In a side panel the panel scrolls; in the wizard the list keeps its own box. */
  inPanel?: boolean
  onChange: (ids: string[]) => void
}

export default function PropertyFormStepAmenities({ selectedIds, onChange, inPanel = false }: Props) {
  const { t } = useTranslation()
  const { data: amenities = [], isLoading, isError } = useAmenities()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return amenities
    const q = search.toLowerCase()
    return amenities.filter((a) => a.name.toLowerCase().includes(q))
  }, [amenities, search])

  const grouped = useMemo(() => {
    const map = new Map<AmenityCategory, typeof filtered>()
    for (const a of filtered) {
      const list = map.get(a.category) || []
      list.push(a)
      map.set(a.category, list)
    }
    return map
  }, [filtered])

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  if (isLoading) {
    return <Spinner size="sm" />
  }

  if (isError) {
    return (
      <p className="text-sm text-danger text-center py-4">
        {t('properties.form.amenitiesError')}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('properties.form.searchAmenities')}
          className="w-full bg-surface-card border border-line rounded-xl p-3 pl-9 outline-none focus:border-accent text-ink text-sm"
        />
      </div>

      {amenities.length === 0 && !isLoading && (
        <p className="text-sm text-ink-muted text-center py-4">
          {t('properties.form.noAmenities')}
        </p>
      )}

      <div className={inPanel ? 'space-y-5' : 'space-y-5 max-h-80 overflow-y-auto'}>
        {Array.from(grouped.entries()).map(([category, items]) => (
          <div key={category}>
            <h3 className="text-xs font-semibold text-ink-muted mb-2">
              {t(`properties.amenityCategories.${category}`)}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {items.map((amenity) => {
                const isSelected = selectedIds.includes(amenity.id)
                return (
                  <label
                    key={amenity.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-all text-left cursor-pointer min-w-0 ${
                      isSelected
                        ? 'bg-accent-soft text-accent-ink border-accent font-semibold'
                        : 'bg-surface-card text-ink border-line hover:bg-surface-page'
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggle(amenity.id)}
                      className="shrink-0"
                    />
                    <span className="truncate" title={amenity.name}>{amenity.name}</span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedIds.length > 0 && (
        <p className="text-xs text-ink-muted">
          {t('properties.form.amenitiesSelected', { count: selectedIds.length })}
        </p>
      )}
    </div>
  )
}
