import type { ReactNode } from 'react'

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'accent' | 'ember'

const TONES: Record<Tone, string> = {
  ok: 'bg-ok/10 text-ok border-ok/25',
  warn: 'bg-warn/10 text-warn border-warn/25',
  danger: 'bg-danger/10 text-danger border-danger/25',
  info: 'bg-accent-2/10 text-accent-2 border-accent-2/25',
  accent: 'bg-accent/10 text-accent border-accent/25',
  ember: 'bg-ember/10 text-ember border-ember/25',
  neutral: 'bg-surface-3/70 text-muted border-border-strong',
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
      className={`inline-flex items-center gap-1.5 rounded-xs border px-1.5 py-[3px] text-[10px] font-semibold uppercase leading-none tracking-[0.14em] ${TONES[tone]} ${className}`}
    >
      {dot && <span className="h-1 w-1 rounded-full bg-current" />}
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
