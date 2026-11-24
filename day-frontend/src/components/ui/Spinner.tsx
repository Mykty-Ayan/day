import { useTranslation } from 'react-i18next'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

export default function Spinner({ size = 'md', label }: SpinnerProps) {
  const { t } = useTranslation()
  const sizeClasses = {
    sm: 'w-5 h-5 border-2',
    md: 'w-8 h-8 border-[3px]',
    lg: 'w-12 h-12 border-[3px]',
  }

  return (
    <div role="status" className="flex flex-col items-center justify-center py-20 gap-3">
      <div
        className={`${sizeClasses[size]} border-line border-t-ink rounded-full animate-spin`}
        aria-hidden="true"
      />
      {label !== undefined ? (
        <p className="text-sm text-ink-muted">{label}</p>
      ) : (
        <p className="text-sm text-ink-muted">{t('common.loading')}</p>
      )}
    </div>
  )
}
