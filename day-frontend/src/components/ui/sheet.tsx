import type { ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** A panel from the right edge: finish one thing and stay on the screen below. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-overlay bg-black/35" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-overlay flex w-full max-w-sm flex-col gap-5 overflow-y-auto border-l border-line bg-surface-card p-5 text-ink outline-none safe-area-bottom"
        >
          <div className="flex items-center justify-between gap-3">
            <DialogPrimitive.Title className="text-base font-bold text-ink">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={t('common.close')}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-page hover:text-ink lg:h-9 lg:w-9"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
