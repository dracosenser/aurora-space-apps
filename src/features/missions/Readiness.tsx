import { useMemo } from 'react'
import { Badge } from '../../components/ui/Badge'
import { CAREER_LIMIT_MSV, DOMAINS, DUTY_CEILING, EXERCISE_DOSE_MIN, FEVER_C, HYPOXEMIA_SPO2, WEAKEST_LINK_MARGIN, assess, scoreSeries, testRecommendation, type Assessment, type Finding, type WhatIf } from '../../sim/assess'
import { SLEEP_MODEL } from '../../sim/reference'
import type { MissionConfig, SimulationResult } from '../../sim/types'

const STATUS_TEXT: Record<Assessment['status'], string> = { nominal: 'text-ok', watch: 'text-warn', caution: 'text-danger' }
const SEV_TONE = { major: 'danger', moderate: 'warn', minor: 'neutral' } as const

/** Score history across the mission, with the status bands and the selected day. */
function ScoreHistory({ series, day }: { series: number[]; day: number }) {
  const W = 600
  const H = 120
  const x = (d: number) => (series.length <= 1 ? 0 : ((d - 1) / (series.length - 1)) * W)
  const y = (v: number) => H - (v / 100) * H
  const pts = series.map((v, i) => `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-28 w-full" role="img" aria-label="Readiness across the mission">
      <rect x={0} y={y(100)} width={W} height={y(80) - y(100)} className="fill-ok/10" />
      <rect x={0} y={y(80)} width={W} height={y(65) - y(80)} className="fill-warn/10" />
      <rect x={0} y={y(65)} width={W} height={y(0) - y(65)} className="fill-danger/10" />
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="text-text-strong" />
      <line x1={x(day)} x2={x(day)} y1={0} y2={H} stroke="currentColor" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" className="text-accent" />
    </svg>
  )
}

function WhatIfLine({ w }: { w: WhatIf | null | undefined }) {
  if (!w) return null
  const delta = w.after - w.before
  return (
    <p className="mono mt-2 text-[11px] text-text">
      Re-simulated {w.from === 'tomorrow' ? 'with this applied from tomorrow' : 'as if this had applied from mission start'}: readiness on day {w.compareDay}{' '}
      <span className="text-text-strong">
        {w.before} → {w.after}
      </span>{' '}
      <span className={delta > 0 ? 'text-ok' : delta < 0 ? 'text-danger' : 'text-muted'}>({delta > 0 ? '+' : ''}{delta})</span>
    </p>
  )
}

function FindingCard({ f, whatIf }: { f: Finding; whatIf: WhatIf | null | undefined }) {
  const top = f.causes.slice(0, 4)
  return (
    <article className="border border-border p-3.5">
      <header className="flex flex-wrap items-center gap-2">
        <Badge tone={SEV_TONE[f.severity]}>{f.severity}</Badge>
        <h4 className="min-w-0 flex-1 text-sm text-text-strong">{f.title}</h4>
        <span className="mono text-[11px] text-muted">−{f.impact.toFixed(1)} overall</span>
      </header>
      <p className="mt-2 text-xs leading-relaxed text-text">{f.evidence}</p>
      {top.length > 0 && (
        <div className="mt-2.5">
          <p className="eyebrow-sm mb-1">What drives it in the model</p>
          <ul className="space-y-1">
            {top.map((c) => (
              <li key={c.effectId} className="grid grid-cols-[1fr_auto] items-center gap-x-3 text-[11px]">
                <span className="truncate text-text">{c.label}</span>
                <span className="mono text-muted">
                  {c.amount >= 10 ? c.amount.toFixed(0) : c.amount.toFixed(2)} {f.causeUnit} · {Math.round(c.share * 100)} %
                </span>
                <span className="col-span-2 h-1 bg-surface-3">
                  <span className="block h-1 bg-accent" style={{ width: `${Math.round(c.share * 100)}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {f.observed && <p className="mt-2 text-[11px] leading-relaxed text-text"><span className="eyebrow-sm mr-1.5">In the data</span>{f.observed}</p>}
      {f.recommendation && (
        <div className="mt-3 border-l-2 border-accent bg-surface-2/60 px-3 py-2">
          <p className="eyebrow-sm mb-1 text-accent">Recommendation</p>
          <p className="text-xs text-text-strong">{f.recommendation.action}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">{f.recommendation.why}</p>
          <WhatIfLine w={whatIf} />
        </div>
      )}
      <p className="mt-2 text-[10px] leading-snug text-faint">Source: {f.source}</p>
    </article>
  )
}

/**
 * Readiness for one astronaut on one day: the score, the five areas behind it,
 * each weakness with its evidence, cause and data link, and a recommendation
 * tested by re-running the simulation.
 */
export function ReadinessPanel({ m, r, personId, day }: { m: MissionConfig; r: SimulationResult; personId: string; day: number }) {
  const a = useMemo(() => assess(m, r, personId, day), [m, r, personId, day])
  const series = useMemo(() => scoreSeries(m, r, personId), [m, r, personId])
  const tests = useMemo(() => {
    const out = new Map<string, WhatIf | null>()
    if (!a) return out
    for (const f of a.findings.slice(0, 8)) {
      const rec = f.recommendation
      if (rec && !out.has(rec.key)) out.set(rec.key, testRecommendation(m, r, personId, a.day, rec))
    }
    return out
  }, [a, m, r, personId])
  if (!a) return null
  const weakest = [...a.domains].sort((x, y) => x.score - y.score)[0]
  const shown = a.findings.filter((f) => f.points >= 2)

  return (
    <section className="border border-border">
      <div className="grid gap-4 border-b border-border p-4 lg:grid-cols-[auto_1fr]">
        <div className="min-w-48">
          <p className="eyebrow-sm">Readiness · day {a.day}</p>
          <p className={`mono mt-1 text-5xl ${STATUS_TEXT[a.status]}`}>{a.score}</p>
          <p className="mt-1 flex items-center gap-2 text-xs">
            <Badge tone={a.status === 'nominal' ? 'ok' : a.status === 'watch' ? 'warn' : 'danger'}>{a.status}</Badge>
            {a.trend !== null && (
              <span className={a.trend > 0 ? 'text-ok' : a.trend < 0 ? 'text-danger' : 'text-muted'}>
                {a.trend > 0 ? '▲' : a.trend < 0 ? '▼' : '■'} {Math.abs(a.trend)} vs day {a.day - 7}
              </span>
            )}
          </p>
          {a.heldBy && (
            <p className="mt-2 max-w-56 text-[11px] leading-snug text-danger">
              Held at {a.heldBy.ceiling} by a fitness-for-duty flag: {a.heldBy.title.toLowerCase()} (weighted mean {Math.round(a.weighted)}).
            </p>
          )}
          {a.capped && (
            <p className="mt-2 max-w-56 text-[11px] leading-snug text-muted">
              Held at {weakest.label.toLowerCase()} ({Math.round(weakest.score)}) + {WEAKEST_LINK_MARGIN}: one weak area is not averaged away (weighted mean {Math.round(a.weighted)}).
            </p>
          )}
        </div>
        <div>
          <ScoreHistory series={series} day={a.day} />
          <p className="annotate mt-1">READINESS, DAY 1–{r.days} · GREEN ≥ 80 NOMINAL · AMBER 65–79 WATCH · RED &lt; 65 CAUTION</p>
        </div>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-5">
        {a.domains.map((d) => (
          <div key={d.id} className="bg-surface p-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs text-text-strong">{d.label}</p>
              <span className="annotate">{Math.round(d.weight * 100)} %</span>
            </div>
            <div className="mt-2 h-1.5 bg-surface-3">
              <div className={`h-1.5 ${d.score >= 80 ? 'bg-ok' : d.score >= 65 ? 'bg-warn' : 'bg-danger'}`} style={{ width: `${d.score}%` }} />
            </div>
            <p className="mono mt-1 text-sm text-text-strong">{Math.round(d.score)}</p>
            <p className="text-[10.5px] leading-snug text-muted">{d.findings.length ? d.findings.map((f) => f.title).join(' · ') : 'Within reference'}</p>
          </div>
        ))}
      </div>

      <div className="p-4">
        <p className="eyebrow mb-2 text-text-strong">Weaknesses and recommendations for {a.name}</p>
        {shown.length === 0 ? (
          <p className="text-xs text-muted">No area loses points on day {a.day}: sleep covers need, exercise meets the countermeasure dose, and cabin conditions are within reference.</p>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {shown.map((f) => (
              <FindingCard key={f.id} f={f} whatIf={f.recommendation ? tests.get(f.recommendation.key) : null} />
            ))}
          </div>
        )}

        <details className="mt-4 text-xs text-text">
          <summary className="cursor-pointer text-muted hover:text-text-strong">How the score is calculated</summary>
          <div className="mt-2 space-y-2 leading-relaxed">
            <p>
              Readiness = the weighted mean of five areas, each scored 0–100 by subtracting points for the findings above. It is at most the weakest area + {WEAKEST_LINK_MARGIN}. Every input is a 7-day mean or a cumulative state, so the score follows the physiology rather than single noisy days. Weights and point slopes are AURORA's operational choices for ranking attention, not a validated clinical instrument.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {DOMAINS.map((d) => (
                <li key={d.id}>
                  <span className="text-text-strong">{d.label} ({Math.round(d.weight * 100)} %).</span> {d.covers}
                </li>
              ))}
            </ul>
            <p>
              <span className="text-text-strong">Sleep debt.</span> Each night adds (need − sleep) hours; debt decays with a {SLEEP_MODEL.decayDays}-day time constant. {SLEEP_MODEL.nightEquivalentH} h of debt impairs performance about as much as one night without sleep (Van Dongen et al., 2003), and costs 40 points per night-equivalent. The need is the astronaut's own setting (default {SLEEP_MODEL.defaultNeedH} h), never their usual sleep, so a short sleeper is not treated as rested.
            </p>
            <p>
              <span className="text-text-strong">Other points.</span> Fatigue above 3.5 (7/pt), stress above 4.5 (6/pt), mood below 6 (8/pt); exercise below {EXERCISE_DOSE_MIN} min/day in reduced gravity (up to 25); strength loss beyond 2 % (2.5/%), bone loss beyond 0.5 % (12/%); resting HR beyond +2 bpm (4/bpm), HRV drop beyond 8 % (1.2/%), blood pressure stage 1 (10) or 2 (25), SpO₂ below 95 % (6/%), body temperature above 37.5 °C (16/°C) or a fever of {FEVER_C} °C or more (30, +20/°C); 10 per cabin parameter outside its reference range; radiation 60 × the share of the {CAREER_LIMIT_MSV} mSv career limit used.
            </p>
            <p>
              <span className="text-text-strong">Fitness-for-duty flags.</span> A fever (7-day mean ≥ {FEVER_C} °C) or SpO₂ below {HYPOXEMIA_SPO2} % holds the score at {DUTY_CEILING} or below, whatever the other areas show, until it resolves.
            </p>
            <p>
              <span className="text-text-strong">Recommendations</span> are tested, not asserted: AURORA re-runs this astronaut's simulation with the change (from tomorrow when there is time left, otherwise from mission start) and reports the readiness it produces.
            </p>
          </div>
        </details>
      </div>
    </section>
  )
}
