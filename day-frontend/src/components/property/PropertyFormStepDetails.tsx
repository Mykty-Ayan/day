interface DetailsData {
  rooms: string
  beds: string
  area_living: string
  area_total: string
}

interface Props {
  data: DetailsData
  onChange: (data: DetailsData) => void
}

export default function PropertyFormStepDetails({ data, onChange }: Props) {
  function update<K extends keyof DetailsData>(key: K, value: string) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Rooms
          </label>
          <input
            type="number"
            min="0"
            value={data.rooms}
            onChange={(e) => update('rooms', e.target.value)}
            placeholder="2"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Beds
          </label>
          <input
            type="number"
            min="0"
            value={data.beds}
            onChange={(e) => update('beds', e.target.value)}
            placeholder="3"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Living Area (m²)
          </label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={data.area_living}
            onChange={(e) => update('area_living', e.target.value)}
            placeholder="45"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Total Area (m²)
          </label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={data.area_total}
            onChange={(e) => update('area_total', e.target.value)}
            placeholder="60"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
      </div>
    </div>
  )
}
