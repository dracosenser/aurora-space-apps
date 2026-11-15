import type { ReactNode } from 'react'

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'accent' | 'ember'

/**
 * A stencilled classification mark: hairline rule, flat stock, no fill tint.
 * Colour carries the status; the surface stays matte.
 */
const TONES: Record<Tone, string> = {
  ok: 'text-ok border-ok/40',
  warn: 'text-warn border-warn/40',
  danger: 'text-danger border-danger/40',
  info: 'text-accent-2 border-accent-2/40',
  accent: 'text-accent border-accent/40',
  ember: 'text-ember border-ember/40',
  neutral: 'text-muted border-border-strong',
}

export function Badge({
  tone = 'neutral',
  children,
  className = '',
  dot = false,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
  dot?: boolean
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-1.5 py-[3px] text-[9px] font-medium uppercase leading-none tracking-[0.18em] ${TONES[tone]} ${className}`}
    >
      {dot && <span className="h-1 w-1 bg-current" />}
      {children}
    </span>
  )
}

export function severityTone(sev: 'info' | 'watch' | 'caution'): Tone {
  return sev === 'caution' ? 'danger' : sev === 'watch' ? 'warn' : 'info'
}

export function statusTone(status: 'nominal' | 'watch' | 'caution'): Tone {
  return status === 'nominal' ? 'ok' : status === 'watch' ? 'warn' : 'danger'
}
