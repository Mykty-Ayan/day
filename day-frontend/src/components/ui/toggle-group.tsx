import * as React from 'react'
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import { cn } from '../../lib/utils'

const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    className={cn(
      'inline-flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-line bg-surface-page p-1',
      className,
    )}
    {...props}
  />
))
ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(
      'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg px-3 py-2 text-center text-xs font-bold leading-tight text-ink-muted transition-colors whitespace-nowrap',
      'hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      'data-[state=on]:bg-surface-card data-[state=on]:text-ink data-[state=on]:shadow-sm',
      className,
    )}
    {...props}
  />
))
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName

export { ToggleGroup, ToggleGroupItem }
