import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-[#04121a] hover:brightness-110 border-transparent font-semibold',
  outline: 'border-border-strong bg-surface-2 text-text hover:border-accent/60 hover:text-text-strong',
  ghost: 'border-transparent text-muted hover:bg-surface-3 hover:text-text-strong',
  danger: 'border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
}

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
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
      className={`inline-flex items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
