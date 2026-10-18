import { useTranslation } from 'react-i18next'
import type { PropertyType } from '../../types/property'

interface BasicData {
  name: string
  internal_name: string
  type: PropertyType
  description: string
  source_url: string
  map_url: string
  whatsapp_product_url: string
  video_url: string
  listing_urls: string
  hourly_listing_urls: string
}

interface Props {
  data: BasicData
  onChange: (data: BasicData) => void
  errors: Partial<Record<keyof BasicData, string>>
}

const propertyTypeValues: PropertyType[] = ['apartment', 'house', 'room']

// The flat's listings by the kind of stay: field, input id, translation key.
const listingFields = [
  ['listing_urls', 'listing-urls', 'listingUrls'],
  ['hourly_listing_urls', 'hourly-listing-urls', 'hourlyListingUrls'],
] as const

// The links the CRM hands to guests, with their translation keys.
const linkFields = [
  ['map_url', 'mapUrl'],
  ['whatsapp_product_url', 'whatsappProductUrl'],
  ['video_url', 'videoUrl'],
] as const

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

      {linkFields.map(([key, label]) => (
        <div key={key}>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            {t(`properties.form.${label}`)}
          </label>
          <input
            type="url"
            value={data[key]}
            onChange={(e) => update(key, e.target.value)}
            placeholder={t(`properties.form.${label}Placeholder`)}
            className={`w-full bg-gray-50 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm ${
              errors[key] ? 'border-red-300 bg-red-50' : 'border-gray-200'
            }`}
          />
          {errors[key] && <p className="text-red-600 text-xs mt-1">{errors[key]}</p>}
        </div>
      ))}

      {/* Krisha lists a flat once to rent by the night and once by the hour: the
          list the guest's link is in tells the CRM which stay they mean. */}
      {listingFields.map(([key, id, label]) => (
        <div key={key}>
          <label htmlFor={id} className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            {t(`properties.form.${label}`)}
          </label>
          <textarea
            id={id}
            rows={3}
            value={data[key]}
            onChange={(e) => update(key, e.target.value)}
            placeholder={t(`properties.form.${label}Placeholder`)}
            className={`w-full resize-none bg-gray-50 border rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm ${
              errors[key] ? 'border-red-300 bg-red-50' : 'border-gray-200'
            }`}
          />
          {errors[key] ? (
            <p className="text-red-600 text-xs mt-1">{errors[key]}</p>
          ) : (
            <p className="text-gray-500 text-xs mt-1">{t(`properties.form.${label}Hint`)}</p>
          )}
        </div>
      ))}
    </div>
  )
}
