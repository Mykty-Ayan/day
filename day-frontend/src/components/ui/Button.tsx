import { motion, type HTMLMotionProps } from 'framer-motion'
import { forwardRef, type ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'disabled'

type ButtonOwnProps = {
  variant?: ButtonVariant
  children: ReactNode
  disabled?: boolean
  nowrap?: boolean
  className?: string
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
}

type ButtonProps = ButtonOwnProps &
  Omit<HTMLMotionProps<'button'>, keyof ButtonOwnProps>

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover',
  secondary:
    'border border-line bg-surface-card text-ink hover:bg-surface-page',
  disabled:
    'bg-surface-page text-ink-muted/70 cursor-not-allowed',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    children,
    disabled,
    nowrap = false,
    className = '',
    onClick,
    type = 'button',
    ...rest
  },
  ref,
) {
  const resolvedVariant = disabled ? 'disabled' : variant

  return (
    <motion.button
      ref={ref}
      whileTap={resolvedVariant !== 'disabled' ? { scale: 0.97 } : undefined}
      className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-center text-sm font-semibold leading-5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${nowrap ? 'whitespace-nowrap' : 'whitespace-normal'} ${variantClasses[resolvedVariant]} ${className}`}
      disabled={disabled}
      onClick={onClick}
      type={type}
      {...rest}
    >
      {children}
    </motion.button>
  )
})

export default Button
