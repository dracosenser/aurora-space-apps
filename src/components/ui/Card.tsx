import type { ReactNode } from 'react'

interface CardProps {
  title?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  flush?: boolean
  /** Registration ticks at opposing corners, as on a plate prepared for print. */
  ticked?: boolean
  /** A numbered plate reference shown in the header's right margin. */
  plate?: string
}

export function Card({
  title,
  subtitle,
  action,
  children,
  className = '',
  bodyClassName = '',
  flush = false,
  ticked = false,
  plate,
}: CardProps) {
  return (
    <section className={`panel rounded-md ${ticked ? 'ticked' : ''} ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && (
              <h3 className="eyebrow flex items-center gap-2 text-text-strong">
                {title}
                {plate && <span className="annotate font-normal tracking-[0.08em] normal-case">{plate}</span>}
              </h3>
            )}
            {subtitle && <p className="mt-1.5 text-xs leading-relaxed text-muted">{subtitle}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={flush ? bodyClassName : `p-4 ${bodyClassName}`}>{children}</div>
    </section>
  )
}
