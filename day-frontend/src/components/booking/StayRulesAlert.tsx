import { useTranslation } from 'react-i18next'
import { stayRuleText, type StayRuleBreach } from '../../lib/booking-errors'

/** The apartment's stay rules a booking breaks, and the operator's way to book it anyway. */
export default function StayRulesAlert({
  breaches,
  action,
  busy,
  onOverride,
}: {
  breaches: StayRuleBreach[]
  action: string
  busy: boolean
  onOverride: () => void
}) {
  const { t } = useTranslation()
  return (
    <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">{t('bookings.stayRules.title')}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {breaches.map((breach) => (
          <li key={breach.rule}>{stayRuleText(breach, t)}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onOverride}
        disabled={busy}
        className="mt-3 min-h-[44px] rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50"
      >
        {action}
      </button>
    </div>
  )
}
