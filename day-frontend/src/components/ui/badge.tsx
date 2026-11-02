import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export type BadgeTone = 'neutral' | 'danger' | 'warning' | 'success'

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-page text-ink-muted',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  success: 'bg-success-soft text-success',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
