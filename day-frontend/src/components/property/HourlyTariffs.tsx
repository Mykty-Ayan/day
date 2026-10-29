import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import NumberInput from '../ui/number-input'
import TimePicker from '../ui/time-picker'
import ConfirmDialog from '../ui/ConfirmDialog'
import { useCopyTariffsToAll } from '../../hooks/useProperties'
import { showToast } from '../ui/Toast'

/** The form's text values of the tariff fields; prices as typed, times "HH:MM". */
export interface TariffDraft {
  price_3h: string
  price_3h_weekend: string
  price_6h: string
  price_6h_weekend: string
  price_night: string
  price_night_weekend: string
  late_from: string
  night_to: string
  night_max_hours: string
}

const ROWS = [
  ['h3', 'price_3h', 'price_3h_weekend'],
  ['h6', 'price_6h', 'price_6h_weekend'],
  ['night', 'price_night', 'price_night_weekend'],
] as const

const label = 'block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1'

/** 3 hours, 6 hours and the night at fixed prices, and the hours after which only
 *  the night is sold. `propertyId` is set once the flat has saved prices: only
 *  saved tariffs can be copied to the other flats. */
export default function HourlyTariffs({
  draft,
  onChange,
  propertyId,
}: {
  draft: TariffDraft
  onChange: (next: TariffDraft) => void
  propertyId?: string
}) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const copy = useCopyTariffsToAll(propertyId ?? '')
  const set = (key: keyof TariffDraft) => (value: string) => onChange({ ...draft, [key]: value })

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      <h3 className="text-sm font-bold text-gray-900">{t('tariffs.title')}</h3>
      <p className="mt-1 mb-3 text-xs text-gray-500">{t('tariffs.hint')}</p>
      <div className="grid grid-cols-[1fr_1fr_1fr] gap-x-3 gap-y-2 items-end">
        <span />
        <span className={label}>{t('tariffs.weekdays')}</span>
        <span className={label}>{t('tariffs.weekend')}</span>
        {ROWS.map(([name, weekday, weekend]) => (
          <div key={name} className="contents">
            <span className="pb-3 text-sm font-semibold text-gray-700">{t(`tariffs.${name}`)}</span>
            <NumberInput
              value={draft[weekday]}
              onChange={set(weekday)}
              min={0}
              step={1000}
              ariaLabel={`${t(`tariffs.${name}`)}, ${t('tariffs.weekdays')}`}
            />
            <NumberInput
              value={draft[weekend]}
              onChange={set(weekend)}
              min={0}
              step={1000}
              ariaLabel={`${t(`tariffs.${name}`)}, ${t('tariffs.weekend')}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={label}>{t('tariffs.lateFrom')}</label>
          <TimePicker value={draft.late_from} onChange={set('late_from')} />
        </div>
        <div>
          <label className={label}>{t('tariffs.nightTo')}</label>
          <TimePicker value={draft.night_to} onChange={set('night_to')} />
        </div>
        <div>
          <label className={label}>{t('tariffs.nightMaxHours')}</label>
          <NumberInput value={draft.night_max_hours} onChange={set('night_max_hours')} min={1} max={24} step={1} />
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {t('tariffs.rule', { late: draft.late_from, morning: draft.night_to, hours: draft.night_max_hours })}
      </p>
      {propertyId && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={copy.isPending}
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        >
          {copy.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t('tariffs.copyAll')}
        </button>
      )}
      <ConfirmDialog
        open={confirming}
        title={t('tariffs.copyAll')}
        message={t('tariffs.copyConfirm')}
        confirmLabel={t('tariffs.copyYes')}
        loading={copy.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          copy.mutate(undefined, {
            onSuccess: (count) => {
              setConfirming(false)
              showToast('success', t('tariffs.copied', { n: count }))
            },
            onError: () => {
              setConfirming(false)
              showToast('error', t('tariffs.copyFailed'))
            },
          })
        }
      />
    </div>
  )
}
