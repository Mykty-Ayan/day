import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
  function update<K extends keyof RulesData>(key: K, value: string) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          {t('properties.form.checkInInstructions')}
        </label>
        <textarea
          value={data.check_in_instructions}
          onChange={(e) => update('check_in_instructions', e.target.value)}
          placeholder={t('properties.form.checkInInstructionsPlaceholder')}
          rows={4}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          {t('properties.form.checkOutInstructions')}
        </label>
        <textarea
          value={data.check_out_instructions}
          onChange={(e) => update('check_out_instructions', e.target.value)}
          placeholder={t('properties.form.checkOutInstructionsPlaceholder')}
          rows={4}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          {t('properties.form.houseRules')}
        </label>
        <textarea
          value={data.house_rules}
          onChange={(e) => update('house_rules', e.target.value)}
          placeholder={t('properties.form.houseRulesPlaceholder')}
          rows={4}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm resize-none"
        />
      </div>
    </div>
  )
}
