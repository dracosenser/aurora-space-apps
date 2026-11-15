import { useState } from 'react'
import type { MissionAnalysis } from '../../../engine/analysis'
import type { RecordedAction } from '../../../engine/types'
import { describeIndicatorState } from '../../../engine/explain'
import { Segmented } from '../../../components/ui/Controls'
import { HistoryChart } from './charts'
import { ProvenanceTag, Section, ShiftGauge, Stat, StatusBadge, num, signed } from './shared'

type Range = '30' | '60' | 'all'

/** Everything behind one signal: the measurement, its personal baseline, its history and why it has its status. */
export function NodeInspector({
  analysis,
  indicatorId,
  day,
  color,
  actions,
  onPickDay,
  onCompare,
}: {
  analysis: MissionAnalysis
  indicatorId: string
  day: number
  color: string
  actions: readonly RecordedAction[]
  onPickDay: (day: number) => void
  onCompare: (otherId: string) => void
}) {
  const [range, setRange] = useState<Range>('60')
  const tl = analysis.timelineOf(indicatorId)
  const def = tl.def
  const s = tl.states[day - 1]
  const b = s.baseline && s.baseline.status !== 'insufficient' ? s.baseline : null
  const cfg = analysis.config
  const category = analysis.dataset.categories.find((c) => c.id === def.category)
  const episodes = analysis.episodes.filter((e) => e.indicatorId === indicatorId && e.startDay <= day)
  const rejected = tl.rejectedDays.filter((d) => d <= day)
  const delta = b && s.recentMedian !== null ? s.recentMedian - b.median : null

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          <span className="eyebrow">{category?.label ?? def.category}</span>
        </div>
        <h3 className="display mt-1.5 text-[1.7rem]">{def.label}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={s.status} />
          <ProvenanceTag provenance={def.provenance} />
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-text">{describeIndicatorState(def, s, cfg)}</p>
      </header>

      <div className="grid grid-cols-2 gap-x-3 gap-y-3">
        <Stat
          label="Latest reading"
          value={s.lastValue !== null ? `${num(s.lastValue, def.decimals)} ${def.unit}` : '—'}
          note={s.value !== null ? `mission day ${day}` : s.lastObservedDay ? `last observed day ${s.lastObservedDay}` : 'no observation yet'}
        />
        <Stat
          label="Personal baseline"
          value={b ? `${num(b.median, def.decimals)} ± ${num(b.scale, Math.max(1, def.decimals))}` : 'not established'}
          note={b ? `median ± robust SD · days ${b.windowStart}–${b.windowEnd} · ${b.n} obs` : `${s.baseline?.n ?? 0} observations so far`}
        />
        <Stat
          label="Recent vs baseline"
          value={delta !== null ? `${signed(delta, def.decimals)} ${def.unit}` : '—'}
          note={s.percentChange !== null ? `${signed(s.percentChange, 0)}% · 7-day median ${num(s.recentMedian, def.decimals)}` : 'needs a baseline'}
        />
        <Stat label="Today's robust z" value={num(s.z, 2)} note="(reading − median) ÷ robust SD" />
      </div>

      <Section title="Smoothed deviation" note={s.shift !== null ? `${signed(s.shift, 2)} control-limit units` : 'not available'}>
        <ShiftGauge shift={s.shift} member={cfg.limits.member} limit={cfg.limits.sustained} />
      </Section>

      <Section title="History" note={`to day ${day}`}>
        <div className="mb-2">
          <Segmented size="sm" value={range} onChange={setRange} options={[{ value: '30', label: '30 d' }, { value: '60', label: '60 d' }, { value: 'all', label: 'Mission' }]} />
        </div>
        <HistoryChart analysis={analysis} indicatorId={indicatorId} day={day} range={range === 'all' ? 'all' : parseInt(range, 10)} color={color} actions={actions} onPickDay={onPickDay} />
      </Section>

      <Section title="Detected deviations" note={`${episodes.length} to date`}>
        {episodes.length === 0 ? (
          <p className="text-[11.5px] text-muted">This indicator's smoothed deviation has not crossed its own control limit up to day {day}.</p>
        ) : (
          <ul className="space-y-1">
            {episodes.map((e) => (
              <li key={e.id}>
                <button onClick={() => onPickDay(Math.min(day, e.peakDay))} className="flex w-full items-center justify-between gap-2 rounded-xs border border-border bg-surface-2/60 px-2.5 py-1.5 text-left text-[11.5px] text-text transition-colors hover:border-accent/50">
                  <span className="mono">
                    days {e.startDay}–{Math.min(day, e.endDay)}
                  </span>
                  <span>
                    {e.direction} baseline · peak {signed(e.peakShift, 1)}
                  </span>
                  <span className={e.sustained ? 'text-ember' : 'text-muted'}>{e.sustained ? 'sustained' : 'brief'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {s.trend && (
        <Section title="Trend" note={`last ${s.trend.windowDays} days`}>
          <p className="text-[11.5px] leading-relaxed text-text">
            Theil–Sen slope <span className="mono text-text-strong">{signed(s.trend.slopePerDay * 7, def.decimals + 1)} {def.unit}/week</span> across {s.trend.n} observations; Mann–Kendall p{' '}
            <span className="mono text-text-strong">{s.trend.pValue < 0.001 ? '< 0.001' : `= ${s.trend.pValue.toFixed(3)}`}</span>.
          </p>
        </Section>
      )}

      <Section title="Data quality">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
          <dt className="text-muted">Collection</dt>
          <dd className="text-text">{def.cadenceDays === 1 ? 'Daily' : `About every ${def.cadenceDays} days`}</dd>
          <dt className="text-muted">Last 14 days present</dt>
          <dd className="mono text-text">{Math.round(s.recentCompleteness * 100)}%</dd>
          <dt className="text-muted">Baseline completeness</dt>
          <dd className="mono text-text">{b ? `${Math.round(b.completeness * 100)}%` : '—'}</dd>
          <dt className="text-muted">Readings rejected</dt>
          <dd className="mono text-text">{rejected.length ? `${rejected.length} (day ${rejected.join(', ')})` : 'none'}</dd>
        </dl>
        <p className="mt-2 text-[10.5px] leading-snug text-muted">{def.collection} Rejected readings fall outside the physically plausible range and are excluded.</p>
      </Section>

      <Section title="Test a relationship">
        <label className="block text-[11.5px] text-muted">
          Compare {def.shortLabel.toLowerCase()} with
          <select
            className="mt-1.5 h-9 w-full rounded-sm border border-border-strong bg-surface-2/70 px-2.5 text-sm text-text-strong outline-none focus:border-accent"
            value=""
            onChange={(e) => e.target.value && onCompare(e.target.value)}
          >
            <option value="">Choose another signal…</option>
            {analysis.indicators
              .filter((i) => i.id !== indicatorId)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
          </select>
        </label>
        <p className="mt-1.5 text-[10.5px] leading-snug text-muted">Equivalent to dragging a line between the two signals. It shows what the engine has already evaluated; it does not create a relationship.</p>
      </Section>
    </div>
  )
}
