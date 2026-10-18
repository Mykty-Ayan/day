import { useTranslation } from 'react-i18next'

interface AddressData {
  address_full: string
  apartment_number: string
  entrance: string
  block: string
  floor: string
  complex_name: string
  floors_total: string
  latitude: string
  longitude: string
}

interface Props {
  data: AddressData
  onChange: (data: AddressData) => void
}

export default function PropertyFormStepAddress({ data, onChange }: Props) {
  const { t } = useTranslation()
  function update<K extends keyof AddressData>(key: K, value: string) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
          {t('properties.form.fullAddress')}
        </label>
        <input
          type="text"
          value={data.address_full}
          onChange={(e) => update('address_full', e.target.value)}
          placeholder={t('properties.form.fullAddressPlaceholder')}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            {t('properties.form.complexName')}
          </label>
          <input
            type="text"
            value={data.complex_name}
            onChange={(e) => update('complex_name', e.target.value)}
            placeholder={t('properties.form.complexNamePlaceholder')}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            {t('properties.form.floorsTotal')}
          </label>
          <input
            type="number"
            min={1}
            value={data.floors_total}
            onChange={(e) => update('floors_total', e.target.value)}
            placeholder={t('properties.form.floorsTotalPlaceholder')}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            {t('properties.form.apartmentNumber')}
          </label>
          <input
            type="text"
            value={data.apartment_number}
            onChange={(e) => update('apartment_number', e.target.value)}
            placeholder={t('properties.form.apartmentNumberPlaceholder')}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            {t('properties.form.entrance')}
          </label>
          <input
            type="text"
            value={data.entrance}
            onChange={(e) => update('entrance', e.target.value)}
            placeholder={t('properties.form.entrancePlaceholder')}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            {t('properties.form.block')}
          </label>
          <input
            type="text"
            value={data.block}
            onChange={(e) => update('block', e.target.value)}
            placeholder={t('properties.form.blockPlaceholder')}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            {t('properties.form.floor')}
          </label>
          <input
            type="text"
            value={data.floor}
            onChange={(e) => update('floor', e.target.value)}
            placeholder={t('properties.form.floorPlaceholder')}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            {t('properties.form.latitude')}
          </label>
          <input
            type="text"
            value={data.latitude}
            onChange={(e) => update('latitude', e.target.value)}
            placeholder={t('properties.form.latitudePlaceholder')}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            {t('properties.form.longitude')}
          </label>
          <input
            type="text"
            value={data.longitude}
            onChange={(e) => update('longitude', e.target.value)}
            placeholder={t('properties.form.longitudePlaceholder')}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
      </div>
    </div>
  )
}
