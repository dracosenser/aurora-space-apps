import type { ReactNode } from 'react'
import { Calculator, FlaskConical, PencilLine, Upload, Database } from 'lucide-react'
import type { IndicatorStatus, Provenance, RelationshipStatus } from '../../../engine/types'
import { PROVENANCE_LABEL } from '../../../engine/types'
import { STATUS_LABEL } from '../../../engine/explain'
import { Badge, type Tone } from '../../../components/ui/Badge'

export function num(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return v.toFixed(decimals).replace('-', '−')
}

export function signed(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(decimals)}`.replace('-', '−')
}

export function pValue(p: number | null | undefined): string {
  if (p === null || p === undefined) return '—'
  if (p < 0.0001) return '< 0.0001'
  return p.toFixed(p < 0.01 ? 4 : 3)
}

// Status tones describe how unusual a signal is for this person. They deliberately
// avoid a good/bad colour code: the engine does not judge clinical meaning.
const STATUS_TONE: Record<IndicatorStatus, Tone> = {
  'insufficient-data': 'neutral',
  stale: 'neutral',
  normal: 'neutral',
  unusual: 'info',
  drifting: 'accent',
  sustained: 'ember',
}

export function StatusBadge({ status }: { status: IndicatorStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot={status === 'sustained' || status === 'unusual'}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}

const REL_LABEL: Record<RelationshipStatus, string> = {
  supported: 'Supported by evidence',
  'not-established': 'Not established',
  'insufficient-data': 'Insufficient data',
}

export function RelationshipBadge({ status }: { status: RelationshipStatus }) {
  return (
    <Badge tone={status === 'supported' ? 'accent' : 'neutral'} dot={status === 'supported'}>
      {REL_LABEL[status]}
    </Badge>
  )
}

const PROVENANCE_ICON: Record<Provenance, typeof FlaskConical> = {
  'synthetic-demo': FlaskConical,
  'nasa-research': Database,
  'user-entered': PencilLine,
  imported: Upload,
  'statistical-estimate': Calculator,
}

/** Says where a number came from. Synthetic, user-entered and computed values are never presented alike. */
export function ProvenanceTag({ provenance, className = '' }: { provenance: Provenance; className?: string }) {
  const Icon = PROVENANCE_ICON[provenance]
  const tone =
    provenance === 'synthetic-demo'
      ? 'border-ember/30 bg-ember/8 text-ember'
      : provenance === 'user-entered'
        ? 'border-accent/30 bg-accent/10 text-accent'
        : provenance === 'nasa-research'
          ? 'border-ok/30 bg-ok/10 text-ok'
          : 'border-border-strong bg-surface-3/70 text-muted'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-xs border px-1.5 py-[3px] text-[9px] font-semibold uppercase leading-none tracking-[0.16em] ${tone} ${className}`}>
      <Icon className="h-2.5 w-2.5" /> {PROVENANCE_LABEL[provenance]}
    </span>
  )
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0 border-l border-border pl-3">
      <p className="eyebrow-sm">{label}</p>
      <p className="mono mt-1 truncate text-[15px] leading-tight text-text-strong">{value}</p>
      {note && <p className="mt-0.5 text-[10.5px] leading-snug text-muted">{note}</p>}
    </div>
  )
}

export function Section({ title, note, children, className = '' }: { title: string; note?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`border-t border-border pt-3.5 ${className}`}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h4 className="eyebrow text-text-strong">{title}</h4>
        {note && <span className="annotate">{note}</span>}
      </div>
      {children}
    </section>
  )
}

export function Bullets({ items, tone = 'muted' }: { items: readonly string[]; tone?: 'muted' | 'text' }) {
  return (
    <ul className={`space-y-1.5 text-[11.5px] leading-relaxed ${tone === 'muted' ? 'text-muted' : 'text-text'}`}>
      {items.map((it) => (
        <li key={it} className="flex gap-2">
          <span className="mt-[7px] h-px w-2 shrink-0 bg-border-strong" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Where a smoothed shift sits relative to the pattern-membership threshold and
 * the indicator's own control limit.
 */
export function ShiftGauge({ shift, member, limit }: { shift: number | null; member: number; limit: number }) {
  const range = Math.max(6, limit + 2)
  const pos = (v: number) => `${((Math.max(-range, Math.min(range, v)) + range) / (2 * range)) * 100}%`
  return (
    <div>
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-2 h-1 rounded-full bg-surface-3" />
        <div className="absolute top-2 h-1 bg-accent/25" style={{ left: pos(-member), right: `calc(100% - ${pos(member)})` }} />
        {[-limit, limit].map((v) => (
          <div key={v} className="absolute top-0.5 h-4 w-px bg-ember/80" style={{ left: pos(v) }} />
        ))}
        {[-member, member].map((v) => (
          <div key={v} className="absolute top-1 h-3 w-px bg-border-strong" style={{ left: pos(v) }} />
        ))}
        <div className="absolute top-1 h-3 w-px bg-muted" style={{ left: '50%' }} />
        {shift !== null && <div className="absolute top-0 h-5 w-[3px] -translate-x-1/2 rounded-full bg-text-strong" style={{ left: pos(shift) }} />}
      </div>
      <div className="relative mt-0.5 h-3 text-[9px] text-muted">
        <span className="mono absolute -translate-x-1/2" style={{ left: pos(-limit) }}>−{limit}</span>
        <span className="mono absolute -translate-x-1/2" style={{ left: '50%' }}>0</span>
        <span className="mono absolute -translate-x-1/2" style={{ left: pos(limit) }}>+{limit}</span>
      </div>
      <p className="mt-1 text-[10.5px] leading-snug text-muted">
        Shaded band: within ±{member}, too small to count toward a joint pattern. Ember marks: this indicator's own control limit.
      </p>
    </div>
  )
}
