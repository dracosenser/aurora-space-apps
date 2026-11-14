import type { ReactNode } from 'react'

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral' | 'accent'

const TONES: Record<Tone, string> = {
  ok: 'bg-ok/10 text-ok border-ok/30',
  warn: 'bg-warn/10 text-warn border-warn/30',
  danger: 'bg-danger/10 text-danger border-danger/30',
  info: 'bg-accent-2/10 text-accent-2 border-accent-2/30',
  accent: 'bg-accent/10 text-accent border-accent/30',
  neutral: 'bg-surface-3 text-muted border-border-strong',
}

export function Badge({ tone = 'neutral', children, className = '', dot = false }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${TONES[tone]} ${className}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
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
