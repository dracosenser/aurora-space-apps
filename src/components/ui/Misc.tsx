import type { ReactNode } from 'react'
import { AlertTriangle, FlaskConical, Info, type LucideIcon } from 'lucide-react'
import type { Astronaut } from '../../types'

export function SimulatedTag({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-xs border border-ember/30 bg-ember/8 px-1.5 py-[3px] text-[9px] font-semibold uppercase leading-none tracking-[0.18em] text-ember ${className}`}
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
      className={`flex items-start gap-3 rounded-sm border px-3.5 py-3 text-xs leading-relaxed ${
        tone === 'warn' ? 'border-ember/25 bg-ember/[0.045] text-text' : 'border-border bg-surface-2/60 text-muted'
      } ${className}`}
    >
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone === 'warn' ? 'text-ember' : 'text-accent'}`} />
      <div>{children}</div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 rounded-sm border border-dashed border-border-strong px-6 py-12 text-center">
      <Icon className="h-5 w-5 text-faint" />
      <p className="text-sm font-medium text-text-strong">{title}</p>
      {body && <p className="max-w-sm text-xs leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** A crew identifier chip, framed like the photograph on a personnel file. */
export function Avatar({ astronaut, size = 'md' }: { astronaut: Astronaut; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'h-7 w-7 text-[10px]' : size === 'lg' ? 'h-14 w-14 text-base' : 'h-9 w-9 text-xs'
  return (
    <div
      className={`mono flex shrink-0 items-center justify-center rounded-sm font-semibold tracking-wider ${dim}`}
      style={{
        background: `linear-gradient(160deg, ${astronaut.color}26, ${astronaut.color}0d)`,
        color: astronaut.color,
        border: `1px solid ${astronaut.color}55`,
      }}
    >
      {astronaut.initials}
    </div>
  )
}

/**
 * A single instrument readout: letterspaced label, monospaced figure, and a
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
    <div className={`panel group relative overflow-hidden rounded-md p-4 transition-colors duration-300 hover:border-border-strong ${className}`}>
      {/* A hairline that brightens as the readout is attended to */}
      <span className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-accent/50 transition-transform duration-500 group-hover:scale-x-100" />
      <p className="eyebrow-sm">{label}</p>
      <p className={`mono mt-2 text-[26px] font-medium leading-none tracking-tight ${color}`}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal tracking-normal text-muted">{unit}</span>}
      </p>
      {sub && <div className="mt-2.5 text-[11px] leading-relaxed text-muted">{sub}</div>}
    </div>
  )
}

export function SectionTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`eyebrow text-text-strong ${className}`}>{children}</h2>
}

export function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-xs border border-border bg-surface-2/70 px-2 py-0.5 text-[11px] text-muted">{children}</span>
}

/** A hairline rule carrying a label — used to open a section of a page. */
export function RuledHeading({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="eyebrow shrink-0 text-text-strong">{children}</h2>
      <span className="h-px flex-1 bg-border" />
      {note && <span className="annotate shrink-0">{note}</span>}
    </div>
  )
}
