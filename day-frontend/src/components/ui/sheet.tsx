import { useState, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ChevronLeft, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PopoverContainer } from './popover-container'

/** A panel from the right edge: finish one thing and stay on the screen below. */
export function Sheet({
  open,
  onClose,
  title,
  onBack,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  /** The panel this one was opened from: a step back to it, not out to the screen. */
  onBack?: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  // Menus opened in the panel are drawn in it, where its clicks are.
  const [panel, setPanel] = useState<HTMLDivElement | null>(null)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-overlay bg-black/35" />
        <DialogPrimitive.Content
          ref={setPanel}
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-overlay flex w-full max-w-sm flex-col gap-5 overflow-y-auto overscroll-contain border-l border-line bg-surface-card p-5 text-ink outline-none safe-area-bottom"
        >
          <div className="flex items-center justify-between gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label={t('common.back')}
                className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-page hover:text-ink lg:h-9 lg:w-9"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <DialogPrimitive.Title className="mr-auto text-base font-bold text-ink">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={t('common.close')}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-page hover:text-ink lg:h-9 lg:w-9"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <PopoverContainer.Provider value={panel}>{children}</PopoverContainer.Provider>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
