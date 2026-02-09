import NumberInput from '../ui/number-input'

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
          <NumberInput
            value={data.base_price}
            onChange={(value) => update('base_price', value)}
            min={0}
            step={1000}
            placeholder="10000"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Weekend Markup (%)
          </label>
          <NumberInput
            value={data.weekend_markup}
            onChange={(value) => update('weekend_markup', value)}
            min={0}
            step={1}
            placeholder="20"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          Default Deposit
        </label>
        <NumberInput
          value={data.default_deposit}
          onChange={(value) => update('default_deposit', value)}
          min={0}
          step={1000}
          placeholder="5000"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Extra Adult Price
          </label>
          <NumberInput
            value={data.extra_adult_price}
            onChange={(value) => update('extra_adult_price', value)}
            min={0}
            step={1000}
            placeholder="1500"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Extra Child Price
          </label>
          <NumberInput
            value={data.extra_child_price}
            onChange={(value) => update('extra_child_price', value)}
            min={0}
            step={1000}
            placeholder="1000"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          Base Guests
        </label>
        <NumberInput
          value={data.base_guests}
          onChange={(value) => update('base_guests', value)}
          min={1}
          step={1}
          placeholder="2"
        />
      </div>
    </div>
  )
}
