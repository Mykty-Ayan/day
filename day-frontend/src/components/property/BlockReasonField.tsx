import { useTranslation } from 'react-i18next'

const REASONS = ['repair', 'own', 'platform'] as const

/** Why nights are closed: a tap on a usual reason, or the owner's own words. */
export default function BlockReasonField({ id, value, onChange }: { id: string; value: string; onChange: (reason: string) => void }) {
  const { t } = useTranslation()
  return (
    <>
      <label htmlFor={id} className="text-xs font-semibold text-ink">{t('gantt.closeReason')}</label>
      <div className="flex flex-wrap gap-2">
        {REASONS.map((key) => {
          const label = t(`gantt.reasons.${key}`)
          return (
            <button
              key={key}
              type="button"
              aria-pressed={value === label}
              onClick={() => onChange(label)}
              className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold transition-colors ${
                value === label ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink hover:bg-surface-page'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
      <input
        id={id}
        value={value}
        maxLength={255}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('properties.blocks.reason')}
        className="min-h-[44px] rounded-xl border border-line bg-surface-card px-3 text-sm text-ink outline-none focus:border-accent"
      />
    </>
  )
}
