import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Insight, InsightKind } from '../../../engine/types'
import { Badge, type Tone } from '../../../components/ui/Badge'
import { Bullets, ProvenanceTag, StatusBadge, num, signed } from './shared'

const KIND_LABEL: Record<InsightKind, string> = {
  'multivariable-pattern': 'Multivariable pattern',
  'sustained-deviation': 'Sustained deviation',
  'unusual-change': 'Unusual change',
  'gradual-trend': 'Gradual trend',
  'response-evaluation': 'After a recorded action',
  'insufficient-evidence': 'Insufficient evidence',
  'normal-variation': 'Normal variation',
}

const KIND_TONE: Record<InsightKind, Tone> = {
  'multivariable-pattern': 'ember',
  'sustained-deviation': 'ember',
  'unusual-change': 'info',
  'gradual-trend': 'accent',
  'response-evaluation': 'accent',
  'insufficient-evidence': 'neutral',
  'normal-variation': 'neutral',
}

/** The Constellation Engine's structured explanations for the selected day. */
export function InsightPanel({ insights, day, onSelectIndicator, colorOf }: { insights: Insight[]; day: number; onSelectIndicator: (id: string) => void; colorOf: (id: string) => string }) {
  const [open, setOpen] = useState<string | null>(null)
  const firstId = insights.length ? insights[0].id : null
  const expanded = open ?? firstId

  return (
    <div className="space-y-3">
      <header>
        <p className="eyebrow">Constellation Engine · day {day}</p>
        <h3 className="display mt-1.5 text-[1.6rem]">What the engine sees</h3>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Each finding lists the measurements, baselines, calculations and limits behind it. Evidence grades describe the statistics, never medical certainty.
        </p>
      </header>

      {insights.length === 0 && <p className="text-xs text-muted">No findings for this day.</p>}

      {insights.map((ins) => {
        const isOpen = expanded === ins.id
        return (
          <article key={ins.id} className={`rounded-sm border bg-surface-2/50 ${ins.kind === 'multivariable-pattern' && ins.active ? 'border-ember/40' : 'border-border'}`}>
            <button className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left" onClick={() => setOpen(isOpen ? '' : ins.id)} aria-expanded={isOpen}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={KIND_TONE[ins.kind]}>{KIND_LABEL[ins.kind]}</Badge>
                  {!ins.active && <Badge tone="neutral">ended</Badge>}
                  <span className="annotate">{ins.id}</span>
                </div>
                <p className="mt-1.5 text-[13px] font-medium leading-snug text-text-strong">{ins.title}</p>
                <p className="annotate mt-0.5">
                  days {ins.dateRange.startDay}–{ins.dateRange.endDay ?? 'ongoing'}
                </p>
              </div>
              <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
              <div className="space-y-3.5 border-t border-border px-3 py-3">
                <p className="text-xs leading-relaxed text-text">{ins.narrative}</p>

                {ins.evidence.strength !== 'not-applicable' && (
                  <div className="rounded-xs border border-border bg-surface/70 px-2.5 py-2">
                    <p className="eyebrow-sm">Statistical evidence · {ins.evidence.strength}</p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{ins.evidence.statement}</p>
                  </div>
                )}

                {ins.indicators.length > 0 && (
                  <div>
                    <p className="eyebrow-sm mb-1.5">Measurements and baselines</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead className="text-left text-[9px] uppercase tracking-[0.14em] text-faint">
                          <tr>
                            <th className="py-1 pr-2 font-semibold">Indicator</th>
                            <th className="px-2 py-1 font-semibold">Recent</th>
                            <th className="px-2 py-1 font-semibold">Baseline</th>
                            <th className="px-2 py-1 font-semibold">Shift</th>
                            <th className="py-1 pl-2 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ins.indicators.map((i) => (
                            <tr key={i.indicatorId} className="border-t border-border/70">
                              <td className="py-1.5 pr-2">
                                <button className="flex items-center gap-1.5 text-left text-text hover:text-text-strong" onClick={() => onSelectIndicator(i.indicatorId)}>
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorOf(i.indicatorId) }} />
                                  {i.label}
                                </button>
                              </td>
                              <td className="mono px-2 py-1.5 text-text-strong">
                                {num(i.recentMedian ?? i.value, i.unit === 'h' || i.unit === '/10' ? 1 : 0)} <span className="text-faint">{i.unit}</span>
                              </td>
                              <td className="mono px-2 py-1.5 text-muted">{num(i.baselineMedian, i.unit === 'h' || i.unit === '/10' ? 1 : 0)}</td>
                              <td className="mono px-2 py-1.5 text-text">{signed(i.shift, 1)}</td>
                              <td className="py-1.5 pl-2">
                                <StatusBadge status={i.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div>
                  <p className="eyebrow-sm mb-1.5">Calculations performed</p>
                  <dl className="space-y-2">
                    {ins.calculations.map((c) => (
                      <div key={c.label}>
                        <dt className="flex items-baseline justify-between gap-3 text-[11.5px]">
                          <span className="text-text">{c.label}</span>
                          <span className="mono text-right text-text-strong">{c.value}</span>
                        </dt>
                        <dd className="mt-0.5 text-[10.5px] leading-snug text-muted">{c.detail}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div>
                  <div className="flex items-baseline justify-between">
                    <p className="eyebrow-sm">Data completeness</p>
                    <span className="mono text-[11px] text-text">
                      {ins.completeness.observed} of {ins.completeness.expected} expected ({Math.round(ins.completeness.fraction * 100)}%)
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full bg-accent" style={{ width: `${ins.completeness.fraction * 100}%` }} />
                  </div>
                </div>

                {ins.limitations.length > 0 && (
                  <div>
                    <p className="eyebrow-sm mb-1.5">Limitations</p>
                    <Bullets items={ins.limitations} />
                  </div>
                )}
                {ins.reviewSteps.length > 0 && (
                  <div>
                    <p className="eyebrow-sm mb-1.5">Suggested review steps</p>
                    <Bullets items={ins.reviewSteps} tone="text" />
                  </div>
                )}
                <ProvenanceTag provenance={ins.provenance} />
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}
