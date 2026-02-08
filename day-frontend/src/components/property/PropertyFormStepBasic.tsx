import type { PropertyType } from '../../types/property'

interface BasicData {
  name: string
  internal_name: string
  type: PropertyType
  description: string
  source_url: string
}

interface Props {
  data: BasicData
  onChange: (data: BasicData) => void
  errors: Partial<Record<keyof BasicData, string>>
}

const propertyTypes: { value: PropertyType; label: string }[] = [
  { value: 'apartment', label: 'Apartment' },
  { value: 'house', label: 'House' },
  { value: 'room', label: 'Room' },
]

export default function PropertyFormStepBasic({ data, onChange, errors }: Props) {
  function update<K extends keyof BasicData>(key: K, value: BasicData[K]) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          Public Name
        </label>
        <input
          type="text"
          value={data.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="Cozy Downtown Studio"
          className={`w-full bg-gray-50 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm ${
            errors.name ? 'border-red-300 bg-red-50' : 'border-gray-200'
          }`}
        />
        {errors.name && (
          <p className="text-red-600 text-xs mt-1">{errors.name}</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          Internal Name
        </label>
        <input
          type="text"
          value={data.internal_name}
          onChange={(e) => update('internal_name', e.target.value)}
          placeholder="APT-001-Downtown"
          className={`w-full bg-gray-50 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm ${
            errors.internal_name ? 'border-red-300 bg-red-50' : 'border-gray-200'
          }`}
        />
        {errors.internal_name && (
          <p className="text-red-600 text-xs mt-1">{errors.internal_name}</p>
        )}
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          Type
        </label>
        <div className="flex gap-2">
          {propertyTypes.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => update('type', value)}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                data.type === value
                  ? 'bg-black text-white border-black'
                  : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          Description
        </label>
        <textarea
          value={data.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder="A beautiful property in the heart of the city..."
          rows={3}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          Source URL
        </label>
        <input
          type="url"
          value={data.source_url}
          onChange={(e) => update('source_url', e.target.value)}
          placeholder="https://booking.com/..."
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
        />
      </div>
    </div>
  )
}
