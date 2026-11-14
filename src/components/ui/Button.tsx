import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'ember'
type Size = 'sm' | 'md'

/**
 * Instrument-panel buttons: squared corners, hairline borders, no gloss.
 * The primary action earns its weight from contrast — cool white on near-black
 * — leaving electric blue to do its work as an accent rather than a fill.
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'border-transparent bg-text-strong font-medium text-bg hover:brightness-[1.08]',
  outline: 'border-border-strong bg-surface-2/60 text-text hover:border-accent/55 hover:bg-surface-3/70 hover:text-text-strong',
  ghost: 'border-transparent text-muted hover:bg-surface-3/70 hover:text-text-strong',
  danger: 'border-danger/35 bg-danger/10 text-danger hover:bg-danger/18',
  ember: 'border-ember/40 bg-ember/10 text-ember hover:bg-ember/18',
}

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[11px] gap-1.5 tracking-wide',
  md: 'h-9 px-3.5 text-[13px] gap-2',
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
      className={`inline-flex items-center justify-center rounded-sm border transition-[background-color,border-color,color,filter] duration-200 disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
