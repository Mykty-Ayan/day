import { useTranslation } from 'react-i18next'
import type { CheckInMethod } from '../../types/property'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import TimeChips, { CHECK_IN_TIMES, CHECK_OUT_TIMES } from '../ui/time-chips'

const CHECK_IN_METHODS: CheckInMethod[] = ['lockbox', 'keypad', 'smart_lock', 'building_staff', 'host_greets', 'other']
const NOT_SET = 'not_set'

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

  const select =
    'w-full bg-surface-card border border-line rounded-xl p-3 outline-none focus:border-accent text-ink text-sm'
  // The usual hours by one press, any other typed; the flat keeps whole hours, so "07:00" is
  // saved as 7 and "16:30" stays as typed for the form to refuse. Empty is the company's hour.
  const hourField = (key: 'check_in_hour' | 'check_out_hour', label: string, options: string[], company: string) => {
    const id = key === 'check_in_hour' ? 'check-in-hour' : 'check-out-hour'
    const value = /^\d{1,2}$/.test(data[key]) ? `${data[key].padStart(2, '0')}:00` : data[key]
    return (
      <div>
        <span id={`${id}-label`} className="block text-xs font-semibold text-ink-muted">{label}</span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={data[key] === ''}
            onClick={() => update(key, '')}
            className={`h-9 rounded-lg px-2 text-sm font-semibold transition-colors ${
              data[key] === '' ? 'bg-accent text-white' : 'border border-line text-ink hover:bg-surface-page'
            }`}
          >
            {t('properties.form.defaultHour', { hour: company })}
          </button>
          <TimeChips
            id={id}
            labelledBy={`${id}-label`}
            options={options}
            value={value}
            allowMidnight
            onChange={(time) => update(key, /^([01]\d|2[0-3]):00$/.test(time) ? String(Number(time.slice(0, 2))) : time)}
          />
        </div>
        {errors[key] && <p className="mt-1 text-xs text-danger">{errors[key]}</p>}
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {hourField('check_in_hour', t('properties.form.checkInFrom'), CHECK_IN_TIMES, '14:00')}
        {hourField('check_out_hour', t('properties.form.checkOutUntil'), CHECK_OUT_TIMES, '12:00')}
        <div className="sm:col-span-2">
          <label htmlFor="check-in-method" className="block text-xs font-semibold text-ink-muted">
            {t('properties.form.checkInMethod')}
          </label>
          {/* The list cannot hold an empty value: "not set" goes in it as NOT_SET. */}
          <Select
            value={data.check_in_method || NOT_SET}
            onValueChange={(method) => update('check_in_method', method === NOT_SET ? '' : method)}
          >
            <SelectTrigger id="check-in-method" className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOT_SET}>{t('properties.form.notSet')}</SelectItem>
              {CHECK_IN_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {t(`properties.checkInMethod.${method}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
