interface RulesData {
  check_in_instructions: string
  check_out_instructions: string
  house_rules: string
}

interface Props {
  data: RulesData
  onChange: (data: RulesData) => void
}

export default function PropertyFormStepRules({ data, onChange }: Props) {
  function update<K extends keyof RulesData>(key: K, value: string) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          Check-in Instructions
        </label>
        <textarea
          value={data.check_in_instructions}
          onChange={(e) => update('check_in_instructions', e.target.value)}
          placeholder="Key is in the lockbox by the front door. Code: ..."
          rows={4}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          Check-out Instructions
        </label>
        <textarea
          value={data.check_out_instructions}
          onChange={(e) => update('check_out_instructions', e.target.value)}
          placeholder="Please leave the keys on the kitchen table..."
          rows={4}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          House Rules
        </label>
        <textarea
          value={data.house_rules}
          onChange={(e) => update('house_rules', e.target.value)}
          placeholder="No smoking. No pets. Quiet hours 22:00-08:00..."
          rows={4}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm resize-none"
        />
      </div>
    </div>
  )
}
