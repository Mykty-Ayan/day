import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { useAmenities } from '../../hooks/useProperties'
import type { AmenityCategory } from '../../types/property'

const categoryLabels: Record<AmenityCategory, string> = {
  bathroom: 'Bathroom',
  kitchen: 'Kitchen',
  entertainment: 'Entertainment',
  safety: 'Safety',
  comfort: 'Comfort',
  outdoor: 'Outdoor',
}

interface Props {
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export default function PropertyFormStepAmenities({ selectedIds, onChange }: Props) {
  const { data: amenities = [], isLoading } = useAmenities()
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
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search amenities..."
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 pl-9 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
        />
      </div>

      {amenities.length === 0 && !isLoading && (
        <p className="text-sm text-gray-500 text-center py-4">
          No amenities available yet.
        </p>
      )}

      <div className="space-y-5 max-h-80 overflow-y-auto">
        {Array.from(grouped.entries()).map(([category, items]) => (
          <div key={category}>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              {categoryLabels[category]}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {items.map((amenity) => {
                const isSelected = selectedIds.includes(amenity.id)
                return (
                  <button
                    key={amenity.id}
                    type="button"
                    onClick={() => toggle(amenity.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition-all text-left ${
                      isSelected
                        ? 'bg-black text-white border-black'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'bg-white border-white'
                          : 'border-gray-300'
                      }`}
                    >
                      {isSelected && (
                        <svg
                          className="w-3 h-3 text-black"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </span>
                    {amenity.name}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedIds.length > 0 && (
        <p className="text-xs text-gray-500">
          {selectedIds.length} amenities selected
        </p>
      )}
    </div>
  )
}
