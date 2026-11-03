import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertTriangle, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

/** Radix and CSS, as the Sheet: framer's opacity dropped to 0 for one frame as it
 *  finished, and the whole screen blinked. */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  onConfirm,
  onCancel,
  loading = false,
}: Props) {
  const { t } = useTranslation()
  const resolvedConfirmLabel = confirmLabel ?? t('common.confirm')
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel')

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && !loading && onCancel()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-fade fixed inset-0 z-overlay bg-black/40" />
        <DialogPrimitive.Content className="dialog-pop fixed left-1/2 top-1/2 z-overlay w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-white p-6 shadow-xl outline-none">
          <DialogPrimitive.Close
            aria-label={t('common.close')}
            className="absolute right-3 top-3 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>

          <div className="mb-4 flex items-start gap-3 pr-8">
            {variant === 'danger' && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
            )}
            <div>
              <DialogPrimitive.Title className="text-sm font-bold text-gray-900">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-gray-500">{message}</DialogPrimitive.Description>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="min-h-[44px] w-full rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 sm:w-auto"
            >
              {resolvedCancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className={`min-h-[44px] w-full rounded-xl px-4 py-2 text-xs font-bold text-white transition-colors disabled:opacity-50 sm:w-auto ${
                variant === 'danger' ? 'bg-red-600 hover:bg-red-700' : 'bg-black hover:bg-gray-800'
              }`}
            >
              {loading ? t('common.processing') : resolvedConfirmLabel}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
