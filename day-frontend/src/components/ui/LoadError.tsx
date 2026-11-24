import { useTranslation } from 'react-i18next'
import Button from './Button'

interface Props {
  message: string
  onRetry: () => void
}

/** A load that failed says so, with a way to try again: never an empty list, a zero or
 *  a form that would save blanks over what the server keeps. */
export default function LoadError({ message, onRetry }: Props) {
  const { t } = useTranslation()
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface-card px-5 py-10 text-center">
      <p className="text-sm text-ink">{message}</p>
      <Button variant="secondary" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  )
}
