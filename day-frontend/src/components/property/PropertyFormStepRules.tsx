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
  buffer_minutes: string
  min_lead_hours: string
}

// The apartment's stay rules: bookings made in Day keep to them unless the
// operator confirms a breach. Empty is no rule.
const STAY_RULES = [
  { key: 'min_nights', min: 1, max: 365, step: 1 },
  { key: 'max_nights', min: 1, max: 365, step: 1 },
  // Minutes, in steps of 15, as the server takes them.
  { key: 'buffer_minutes', min: 15, max: 1440, step: 15 },
  { key: 'min_lead_hours', min: 1, max: 720, step: 1 },
] as const

interface Props {
  data: RulesData
  onChange: (data: RulesData) => void
  errors?: Partial<Record<keyof RulesData, string>>
}

export default function PropertyFormStepRules({ data, onChange, errors = {} }: Props) {
  const { t } = useTranslation()
  function update<K extends keyof RulesData>(key: K, value: string) {
    onChange({ ...data, [key]: value })
  }

  const hours = Array.from({ length: 24 }, (_, hour) => hour)
  const select =
    'w-full bg-surface-card border border-line rounded-xl p-3 outline-none focus:border-accent text-ink text-sm'
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-ink-muted">
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
        <label className="block text-xs font-semibold text-ink-muted">
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
        <label className="block sm:col-span-2 text-xs font-semibold text-ink-muted">
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
        <legend className="text-xs font-bold uppercase tracking-wider text-ink-muted">{t('properties.form.stayRules')}</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {STAY_RULES.map(({ key, min, max, step }) => (
            <label key={key} className="block text-xs font-semibold text-ink-muted">
              {t(`properties.form.${key}`)}
              <input
                id={key.replace('_', '-')}
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
                step={step}
                value={data[key]}
                onChange={(e) => update(key, e.target.value)}
                placeholder={t('properties.form.noRule')}
                className={`mt-1.5 ${select}`}
              />
              {errors[key] && <p className="mt-1 text-xs font-normal normal-case tracking-normal text-danger">{errors[key]}</p>}
            </label>
          ))}
        </div>
        <p className="text-xs text-ink-muted">{t('properties.form.stayRulesHint')}</p>
      </fieldset>
      {data.check_in_hour !== '' &&
        data.check_out_hour !== '' &&
        Number(data.check_out_hour) > Number(data.check_in_hour) && (
          <p role="alert" className="text-xs text-danger">
            {t('properties.form.turnoverHours')}
          </p>
        )}
      <div>
        <label className="block text-xs font-semibold text-ink-muted mb-1.5">
          {t('properties.form.checkInInstructions')}
        </label>
        <textarea
          value={data.check_in_instructions}
          onChange={(e) => update('check_in_instructions', e.target.value)}
          placeholder={t('properties.form.checkInInstructionsPlaceholder')}
          rows={4}
          className="w-full bg-surface-card border border-line rounded-xl p-3 outline-none focus:border-accent text-ink text-sm resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-ink-muted mb-1.5">
          {t('properties.form.checkOutInstructions')}
        </label>
        <textarea
          value={data.check_out_instructions}
          onChange={(e) => update('check_out_instructions', e.target.value)}
          placeholder={t('properties.form.checkOutInstructionsPlaceholder')}
          rows={4}
          className="w-full bg-surface-card border border-line rounded-xl p-3 outline-none focus:border-accent text-ink text-sm resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-ink-muted mb-1.5">
          {t('properties.form.houseRules')}
        </label>
        <textarea
          value={data.house_rules}
          onChange={(e) => update('house_rules', e.target.value)}
          placeholder={t('properties.form.houseRulesPlaceholder')}
          rows={4}
          className="w-full bg-surface-card border border-line rounded-xl p-3 outline-none focus:border-accent text-ink text-sm resize-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-ink-muted mb-1.5">
            {t('properties.form.wifiName')}
          </label>
          <input
            type="text"
            value={data.wifi_name}
            onChange={(e) => update('wifi_name', e.target.value)}
            placeholder={t('properties.form.wifiNamePlaceholder')}
            className="w-full bg-surface-card border border-line rounded-xl p-3 outline-none focus:border-accent text-ink text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-muted mb-1.5">
            {t('properties.form.wifiPassword')}
          </label>
          <input
            type="text"
            value={data.wifi_password}
            onChange={(e) => update('wifi_password', e.target.value)}
            placeholder={t('properties.form.wifiPasswordPlaceholder')}
            className="w-full bg-surface-card border border-line rounded-xl p-3 outline-none focus:border-accent text-ink text-sm"
          />
        </div>
      </div>
    </div>
  )
}
