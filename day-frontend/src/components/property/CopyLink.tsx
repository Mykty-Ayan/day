import { useTranslation } from 'react-i18next'
import { showToast } from '../ui/Toast'

/** A link to paste on a platform: shown whole, selected on focus, copied with one press. */
export default function CopyLink({ value, label }: { value: string | undefined; label: string }) {
  const { t } = useTranslation()

  function copy() {
    if (!value) return
    navigator.clipboard.writeText(value).then(
      () => showToast('success', t('properties.calendar.copied')),
      // The link stays on screen to copy by hand.
      () => showToast('error', t('properties.calendar.copyFailed')),
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
      <input
        type="text"
        readOnly
        value={value ?? ''}
        onFocus={(event) => event.currentTarget.select()}
        aria-label={label}
        className="h-10 w-full min-w-0 rounded-lg border border-line bg-surface-page px-3 font-mono text-xs text-ink sm:flex-1"
      />
      <button
        type="button"
        onClick={copy}
        disabled={!value}
        className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-lg border border-line bg-surface-card px-3 text-xs font-bold text-ink transition-colors hover:bg-surface-page disabled:opacity-50"
      >
        {t('properties.calendar.copy')}
      </button>
    </div>
  )
}
