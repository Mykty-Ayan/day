import { useTranslation } from 'react-i18next'
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

const propertyTypeValues: PropertyType[] = ['apartment', 'house', 'room']

export default function PropertyFormStepBasic({ data, onChange, errors }: Props) {
  const { t } = useTranslation()
  function update<K extends keyof BasicData>(key: K, value: BasicData[K]) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          {t('properties.form.publicName')}
        </label>
        <input
          type="text"
          value={data.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder={t('properties.form.publicNamePlaceholder')}
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
          {t('properties.form.internalName')}
        </label>
        <input
          type="text"
          value={data.internal_name}
          onChange={(e) => update('internal_name', e.target.value)}
          placeholder={t('properties.form.internalNamePlaceholder')}
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
          {t('properties.form.type')}
        </label>
        <div className="flex flex-wrap gap-2">
          {propertyTypeValues.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => update('type', value)}
              className={`flex-1 min-w-[6rem] px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                data.type === value
                  ? 'bg-black text-white border-black'
                  : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {t(`common.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          {t('properties.form.description')}
        </label>
        <textarea
          value={data.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder={t('properties.form.descriptionPlaceholder')}
          rows={3}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          {t('properties.form.sourceUrl')}
        </label>
        <input
          type="url"
          value={data.source_url}
          onChange={(e) => update('source_url', e.target.value)}
          placeholder={t('properties.form.sourceUrlPlaceholder')}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
        />
      </div>
    </div>
  )
}
