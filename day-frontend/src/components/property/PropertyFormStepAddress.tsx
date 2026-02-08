interface AddressData {
  address_full: string
  apartment_number: string
  entrance: string
  block: string
  floor: string
  latitude: string
  longitude: string
}

interface Props {
  data: AddressData
  onChange: (data: AddressData) => void
}

export default function PropertyFormStepAddress({ data, onChange }: Props) {
  function update<K extends keyof AddressData>(key: K, value: string) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          Full Address
        </label>
        <input
          type="text"
          value={data.address_full}
          onChange={(e) => update('address_full', e.target.value)}
          placeholder="123 Main Street, City, Country"
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Apartment Number
          </label>
          <input
            type="text"
            value={data.apartment_number}
            onChange={(e) => update('apartment_number', e.target.value)}
            placeholder="4B"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Entrance
          </label>
          <input
            type="text"
            value={data.entrance}
            onChange={(e) => update('entrance', e.target.value)}
            placeholder="A"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Block
          </label>
          <input
            type="text"
            value={data.block}
            onChange={(e) => update('block', e.target.value)}
            placeholder="B"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Floor
          </label>
          <input
            type="text"
            value={data.floor}
            onChange={(e) => update('floor', e.target.value)}
            placeholder="3"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Latitude
          </label>
          <input
            type="text"
            value={data.latitude}
            onChange={(e) => update('latitude', e.target.value)}
            placeholder="43.2381"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Longitude
          </label>
          <input
            type="text"
            value={data.longitude}
            onChange={(e) => update('longitude', e.target.value)}
            placeholder="76.9454"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
      </div>
    </div>
  )
}
