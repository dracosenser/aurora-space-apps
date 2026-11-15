import type { ReactNode } from 'react'
import { AlertTriangle, FlaskConical, Info, type LucideIcon } from 'lucide-react'
import type { Astronaut } from '../../types'

export function SimulatedTag({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border border-ember/40 px-1.5 py-[3px] text-[9px] font-medium uppercase leading-none tracking-[0.2em] text-ember ${className}`}
      title="All crew values shown are synthetic demonstration data, not real NASA measurements."
    >
      <FlaskConical className="h-2.5 w-2.5" /> Simulated
    </span>
  )
}

export function Disclaimer({ children, tone = 'info', className = '' }: { children: ReactNode; tone?: 'info' | 'warn'; className?: string }) {
  const Icon = tone === 'warn' ? AlertTriangle : Info
  return (
    <div
      className={`flex items-start gap-3 border px-4 py-3.5 text-xs leading-relaxed ${
        tone === 'warn' ? 'border-ember/30 bg-surface text-text' : 'border-border bg-surface text-muted'
      } ${className}`}
    >
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone === 'warn' ? 'text-ember' : 'text-muted'}`} />
      <div>{children}</div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 border border-dashed border-border-strong px-6 py-14 text-center">
      <Icon className="h-5 w-5 text-faint" />
      <p className="display text-lg">{title}</p>
      {body && <p className="max-w-sm text-xs leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** A crew identifier chip, framed like the corner of a personnel file. */
export function Avatar({ astronaut, size = 'md' }: { astronaut: Astronaut; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'h-7 w-7 text-[10px]' : size === 'lg' ? 'h-14 w-14 text-sm' : 'h-9 w-9 text-[11px]'
  return (
    <div
      className={`mono flex shrink-0 items-center justify-center font-medium tracking-[0.1em] ${dim}`}
      style={{ color: astronaut.color, border: `1px solid ${astronaut.color}66` }}
    >
      {astronaut.initials}
    </div>
  )
}

/**
 * A single readout: stencilled label, figure set in the editorial serif, and a
 * line of context beneath. The building block of every metric row.
 */
export function Kpi({
  label,
  value,
  unit,
  sub,
  tone,
  className = '',
}: {
  label: string
  value: string | number
  unit?: string
  sub?: ReactNode
  tone?: 'ok' | 'warn' | 'danger' | 'default'
  className?: string
}) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : 'text-text-strong'
  return (
    <div className={`panel group relative p-4 transition-colors duration-300 hover:border-border-strong ${className}`}>
      <p className="eyebrow-sm">{label}</p>
      <p className={`display mt-2.5 text-[28px] leading-none ${color}`}>
        {value}
        {unit && <span className="mono ml-1.5 text-[11px] tracking-normal text-muted">{unit}</span>}
      </p>
      {sub && <div className="mt-2.5 text-[11px] leading-relaxed text-muted">{sub}</div>}
    </div>
  )
}

export function SectionTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`eyebrow text-text-strong ${className}`}>{children}</h2>
}

export function Pill({ children }: { children: ReactNode }) {
  return <span className="border border-border px-2 py-0.5 text-[11px] text-muted">{children}</span>
}

/** A hairline rule carrying a label — used to open a section of a page. */
export function RuledHeading({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-4">
      <h2 className="eyebrow min-w-0 shrink text-text-strong">{children}</h2>
      <span className="h-px flex-1 bg-border" />
      {note && <span className="annotate hidden shrink-0 sm:inline">{note}</span>}
    </div>
  )
}
