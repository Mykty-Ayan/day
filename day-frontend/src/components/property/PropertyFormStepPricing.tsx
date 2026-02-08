interface PricingData {
  base_price: string
  weekend_markup: string
  default_deposit: string
  extra_adult_price: string
  extra_child_price: string
  base_guests: string
}

interface Props {
  data: PricingData
  onChange: (data: PricingData) => void
}

export default function PropertyFormStepPricing({ data, onChange }: Props) {
  function update<K extends keyof PricingData>(key: K, value: string) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Base Price (per night)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={data.base_price}
            onChange={(e) => update('base_price', e.target.value)}
            placeholder="100.00"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Weekend Markup (%)
          </label>
          <input
            type="number"
            min="0"
            step="1"
            value={data.weekend_markup}
            onChange={(e) => update('weekend_markup', e.target.value)}
            placeholder="20"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          Default Deposit
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={data.default_deposit}
          onChange={(e) => update('default_deposit', e.target.value)}
          placeholder="50.00"
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Extra Adult Price
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={data.extra_adult_price}
            onChange={(e) => update('extra_adult_price', e.target.value)}
            placeholder="15.00"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Extra Child Price
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={data.extra_child_price}
            onChange={(e) => update('extra_child_price', e.target.value)}
            placeholder="10.00"
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          Base Guests
        </label>
        <input
          type="number"
          min="1"
          value={data.base_guests}
          onChange={(e) => update('base_guests', e.target.value)}
          placeholder="2"
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
        />
      </div>
    </div>
  )
}
