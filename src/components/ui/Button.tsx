import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'ember'
type Size = 'sm' | 'md'

/**
 * Rectangular, matte, unfilled by default. The primary action is simply ink
 * reversed out of the stock — there is no gloss, gradient or shadow anywhere.
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'border-text-strong bg-text-strong font-medium text-bg hover:bg-text hover:border-text',
  outline: 'border-border-strong bg-transparent text-text hover:bg-surface-3 hover:text-text-strong',
  ghost: 'border-transparent bg-transparent text-muted hover:text-text-strong',
  danger: 'border-danger/40 bg-transparent text-danger hover:bg-surface-3',
  ember: 'border-ember/45 bg-transparent text-ember hover:bg-surface-3',
}

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[10px] gap-1.5 uppercase tracking-[0.14em]',
  md: 'h-9 px-4 text-[11px] gap-2 uppercase tracking-[0.16em]',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  children?: ReactNode
}

export function Button({ variant = 'outline', size = 'md', icon, children, className = '', ...rest }: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center border font-medium transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
