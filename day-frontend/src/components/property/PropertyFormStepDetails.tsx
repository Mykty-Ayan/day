import { useTranslation } from 'react-i18next'
import NumberInput from '../ui/number-input'

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
  const { t } = useTranslation()
  function update<K extends keyof DetailsData>(key: K, value: string) {
    onChange({ ...data, [key]: value })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            {t('properties.form.rooms')}
          </label>
          <NumberInput
            value={data.rooms}
            onChange={(value) => update('rooms', value)}
            min={0}
            step={1}
            placeholder="2"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            {t('properties.form.beds')}
          </label>
          <NumberInput
            value={data.beds}
            onChange={(value) => update('beds', value)}
            min={0}
            step={1}
            placeholder="3"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            {t('properties.form.livingArea')}
          </label>
          <NumberInput
            value={data.area_living}
            onChange={(value) => update('area_living', value)}
            min={0}
            step={0.1}
            placeholder="45"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            {t('properties.form.totalArea')}
          </label>
          <NumberInput
            value={data.area_total}
            onChange={(value) => update('area_total', value)}
            min={0}
            step={0.1}
            placeholder="60"
          />
        </div>
      </div>
    </div>
  )
}
