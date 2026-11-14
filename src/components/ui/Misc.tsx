import type { ReactNode } from 'react'
import { AlertTriangle, FlaskConical, Info, type LucideIcon } from 'lucide-react'
import type { Astronaut } from '../../types'

export function SimulatedTag({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warn ${className}`} title="All crew values shown are synthetic demonstration data, not real NASA measurements.">
      <FlaskConical className="h-3 w-3" /> Simulated data
    </span>
  )
}

export function Disclaimer({ children, tone = 'info', className = '' }: { children: ReactNode; tone?: 'info' | 'warn'; className?: string }) {
  const Icon = tone === 'warn' ? AlertTriangle : Info
  return (
    <div className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-xs leading-relaxed ${tone === 'warn' ? 'border-warn/30 bg-warn/5 text-text' : 'border-border bg-surface-2 text-muted'} ${className}`}>
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone === 'warn' ? 'text-warn' : 'text-accent'}`} />
      <div>{children}</div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border-strong px-6 py-10 text-center">
      <Icon className="h-6 w-6 text-muted" />
      <p className="text-sm font-medium text-text-strong">{title}</p>
      {body && <p className="max-w-sm text-xs text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Avatar({ astronaut, size = 'md' }: { astronaut: Astronaut; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'h-7 w-7 text-[10px]' : size === 'lg' ? 'h-14 w-14 text-lg' : 'h-9 w-9 text-xs'
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${dim}`}
      style={{ background: `${astronaut.color}22`, color: astronaut.color, border: `1px solid ${astronaut.color}66` }}
    >
      {astronaut.initials}
    </div>
  )
}

export function Kpi({ label, value, unit, sub, tone }: { label: string; value: string | number; unit?: string; sub?: ReactNode; tone?: 'ok' | 'warn' | 'danger' | 'default' }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : 'text-text-strong'
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={`mono mt-1.5 text-2xl font-semibold leading-none ${color}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted">{unit}</span>}
      </p>
      {sub && <div className="mt-2 text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function SectionTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`text-[13px] font-semibold uppercase tracking-wider text-text-strong ${className}`}>{children}</h2>
}

export function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-border-strong bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{children}</span>
}
