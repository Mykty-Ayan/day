import { useTranslation } from 'react-i18next'
import type { CheckInMethod } from '../../types/property'

const CHECK_IN_METHODS: CheckInMethod[] = ['lockbox', 'keypad', 'smart_lock', 'building_staff', 'host_greets', 'other']

interface RulesData {
  check_in_hour: string
  check_out_hour: string
  check_in_method: string
  check_in_instructions: string
  check_out_instructions: string
  house_rules: string
  wifi_name: string
  wifi_password: string
  min_nights: string
  max_nights: string
  buffer_hours: string
  min_lead_hours: string
}

// The apartment's stay rules: bookings made in Day keep to them unless the
// operator confirms a breach. Empty is no rule.
const STAY_RULES = [
  { key: 'min_nights', min: 1, max: 365 },
  { key: 'max_nights', min: 1, max: 365 },
  { key: 'buffer_hours', min: 1, max: 24 },
  { key: 'min_lead_hours', min: 1, max: 720 },
] as const

interface Props {
  data: RulesData
  onChange: (data: RulesData) => void
}

export default function PropertyFormStepRules({ data, onChange }: Props) {
  const { t } = useTranslation()
  function update<K extends keyof RulesData>(key: K, value: string) {
    onChange({ ...data, [key]: value })
  }

  const hours = Array.from({ length: 24 }, (_, hour) => hour)
  const select =
    'w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm'
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
          {t('properties.form.checkInFrom')}
          <select
            id="check-in-hour"
            value={data.check_in_hour}
            onChange={(e) => update('check_in_hour', e.target.value)}
            className={`mt-1.5 ${select}`}
          >
            <option value="">{t('properties.form.defaultHour', { hour: '14:00' })}</option>
            {hours.map((hour) => (
              <option key={hour} value={hour}>{`${String(hour).padStart(2, '0')}:00`}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
          {t('properties.form.checkOutUntil')}
          <select
            id="check-out-hour"
            value={data.check_out_hour}
            onChange={(e) => update('check_out_hour', e.target.value)}
            className={`mt-1.5 ${select}`}
          >
            <option value="">{t('properties.form.defaultHour', { hour: '12:00' })}</option>
            {hours.map((hour) => (
              <option key={hour} value={hour}>{`${String(hour).padStart(2, '0')}:00`}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
          {t('properties.form.checkInMethod')}
          <select
            id="check-in-method"
            value={data.check_in_method}
            onChange={(e) => update('check_in_method', e.target.value)}
            className={`mt-1.5 ${select}`}
          >
            <option value="">{t('properties.form.notSet')}</option>
            {CHECK_IN_METHODS.map((method) => (
              <option key={method} value={method}>
                {t(`properties.checkInMethod.${method}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('properties.form.stayRules')}</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {STAY_RULES.map(({ key, min, max }) => (
            <label key={key} className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
              {t(`properties.form.${key}`)}
              <input
                id={key.replace('_', '-')}
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
                value={data[key]}
                onChange={(e) => update(key, e.target.value)}
                placeholder={t('properties.form.noRule')}
                className={`mt-1.5 ${select}`}
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-500">{t('properties.form.stayRulesHint')}</p>
      </fieldset>
      {data.check_in_hour !== '' &&
        data.check_out_hour !== '' &&
        Number(data.check_out_hour) > Number(data.check_in_hour) && (
          <p role="alert" className="text-xs text-red-600">
            {t('properties.form.turnoverHours')}
          </p>
        )}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            {t('properties.form.wifiName')}
          </label>
          <input
            type="text"
            value={data.wifi_name}
            onChange={(e) => update('wifi_name', e.target.value)}
            placeholder={t('properties.form.wifiNamePlaceholder')}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            {t('properties.form.wifiPassword')}
          </label>
          <input
            type="text"
            value={data.wifi_password}
            onChange={(e) => update('wifi_password', e.target.value)}
            placeholder={t('properties.form.wifiPasswordPlaceholder')}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-black/10 text-gray-800 text-sm"
          />
        </div>
      </div>
    </div>
  )
}
