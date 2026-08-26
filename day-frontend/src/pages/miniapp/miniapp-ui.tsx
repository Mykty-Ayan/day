/**
 * Shared pieces of the Mini App shell.
 *
 * Everything here assumes a thumb, not a cursor: 44px minimum targets, one
 * column, and a sheet that slides from the bottom where the desktop app would
 * open a dialog.
 */

import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { tapFeedback } from '../../lib/telegram'

export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="tg-root flex min-h-screen flex-col items-center justify-center px-6 text-center">
      {children}
    </div>
  )
}

export function Section({
  icon,
  title,
  count,
  action,
  children,
  emptyLabel,
}: {
  icon?: ReactNode
  title: string
  count?: number
  action?: ReactNode
  children: ReactNode
  emptyLabel?: string
}) {
  const isEmpty = count === 0
  return (
    <section className="tg-surface overflow-hidden rounded-xl">
      <header className="flex items-center gap-2 px-3 py-2.5">
        {icon}
        <h2 className="flex-1 truncate text-sm font-bold">{title}</h2>
        {count !== undefined && <span className="tg-hint text-xs font-semibold">{count}</span>}
        {action}
      </header>
      {isEmpty && emptyLabel ? (
        <p className="tg-hint px-3 pb-3 text-sm">{emptyLabel}</p>
      ) : (
        <div className="tg-divide-y">{children}</div>
      )}
    </section>
  )
}

/** A full-width tap target. `tone` carries meaning, not decoration. */
export function ActionButton({
  children,
  onClick,
  tone = 'quiet',
  disabled,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  tone?: 'primary' | 'quiet'
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={() => {
        if (disabled) return
        tapFeedback()
        onClick?.()
      }}
      className={`flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-opacity disabled:opacity-40 ${
        tone === 'primary' ? 'tg-active' : 'tg-surface'
      }`}
    >
      {children}
    </button>
  )
}

export function Chip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={() => {
        tapFeedback()
        onClick()
      }}
      className={`min-h-[40px] flex-1 rounded-lg px-2 text-xs font-bold ${
        active ? 'tg-active' : 'tg-surface tg-hint'
      }`}
    >
      {label}
    </button>
  )
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  inputMode,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  inputMode?: 'text' | 'tel' | 'numeric' | 'decimal'
}) {
  return (
    <label className="block">
      <span className="tg-hint mb-1 block text-xs font-bold uppercase tracking-wide">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="tg-surface min-h-[44px] w-full rounded-xl px-3 text-sm outline-none"
      />
    </label>
  )
}

/** Bottom sheet. Locks the page behind it so a long list cannot steal the scroll. */
export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true" aria-label={title}>
      {/* The backdrop dismisses the sheet but must not announce itself as the
          dialog again — the header's close button is the labelled control. */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div className="tg-root relative max-h-[88vh] w-full overflow-y-auto rounded-t-2xl pb-6">
        <header className="tg-root sticky top-0 z-10 flex items-center gap-2 px-4 py-3">
          <h2 className="flex-1 truncate text-base font-bold">{title}</h2>
          <button
            type="button"
            onClick={() => {
              tapFeedback()
              onClose()
            }}
            aria-label="Close"
            className="tg-surface flex h-9 w-9 items-center justify-center rounded-full"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-4 px-4">{children}</div>
      </div>
    </div>
  )
}
