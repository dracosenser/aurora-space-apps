import type { ReactNode } from 'react'

interface CardProps {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  flush?: boolean
}

export function Card({ title, subtitle, action, children, className = '', bodyClassName = '', flush = false }: CardProps) {
  return (
    <section className={`rounded-lg border border-border bg-surface ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && <h3 className="text-[13px] font-semibold uppercase tracking-wider text-text-strong">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={flush ? bodyClassName : `p-4 ${bodyClassName}`}>{children}</div>
    </section>
  )
}
