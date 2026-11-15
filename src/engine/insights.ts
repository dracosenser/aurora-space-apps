// ---------------------------------------------------------------------------
// CONSTELLATION ENGINE — explainable insight generation
//
// Turns analysis results into structured, self-describing insights. Each one
// carries the measurements, baselines, date range, calculations, completeness,
// evidence statement, limitations and review steps behind it.
// ---------------------------------------------------------------------------

import type {
  DeviationEpisode,
  IndicatorDayState,
  IndicatorTimeline,
  Insight,
  InsightIndicator,
  PatternView,
  ResponseEvaluation,
} from './types'
import type { EngineConfig } from './config'

const NOT_A_DIAGNOSIS = 'The engine describes statistical departures from this person\'s own baseline. It does not identify a medical condition or its cause.'
const BASELINE_CAVEAT = 'A personal baseline describes what was typical for this person during the baseline window. It is not a statement that those values were medically healthy.'

function fmt(v: number | null, d: number): string {
  if (v === null || !Number.isFinite(v)) return '—'
  return v.toFixed(d).replace('-', '−')
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

function tailText(p: number | null): string {
  if (p === null) return 'not available'
  if (p < 1e-6) return 'less than 1 in 1,000,000'
  if (p < 1e-3) return `about 1 in ${Math.round(1 / p).toLocaleString('en-US')}`
  return p.toFixed(3)
}

export function toInsightIndicator(tl: IndicatorTimeline, s: IndicatorDayState): InsightIndicator {
  return {
    indicatorId: tl.def.id,
    label: tl.def.label,
    unit: tl.def.unit,
    value: s.lastValue,
    recentMedian: s.recentMedian,
    baselineMedian: s.baseline ? s.baseline.median : null,
    baselineScale: s.baseline ? s.baseline.scale : null,
    z: s.z,
    shift: s.shift,
    percentChange: s.percentChange,
    direction: s.direction,
    status: s.status,
  }
}

function completenessOver(timelines: IndicatorTimeline[], from: number, to: number): { observed: number; expected: number; fraction: number } {
  let observed = 0
  let expected = 0
  for (const tl of timelines) {
    for (let d = Math.max(1, from); d <= to; d++) if (tl.clean[d - 1] !== null) observed++
    expected += Math.max(1, Math.round((to - Math.max(1, from) + 1) / tl.def.cadenceDays))
  }
  return { observed, expected, fraction: expected ? Math.min(1, observed / expected) : 0 }
}

export interface InsightInputs {
  day: number
  timelines: IndicatorTimeline[]
  episodes: DeviationEpisode[]
  patterns: PatternView[]
  responses: ResponseEvaluation[]
  cfg: EngineConfig
}

export function buildInsights({ day, timelines, episodes, patterns, responses, cfg }: InsightInputs): Insight[] {
  const byId = new Map(timelines.map((t) => [t.def.id, t]))
  const stateOf = (id: string) => byId.get(id)!.states[day - 1]
  const insights: Insight[] = []
  const lambda = cfg.ewmaLambda

  // ---- Multivariable patterns -------------------------------------------
  for (const p of patterns) {
    const core = p.members.filter((m) => p.coreMemberIds.includes(m.indicatorId))
    const tls = core.map((m) => byId.get(m.indicatorId)!)
    const lower = core.filter((m) => m.direction === 'below' || (m.direction === 'none' && (m.percentChange ?? 0) < 0)).map((m) => byId.get(m.indicatorId)!.def.label.toLowerCase())
    const higher = core.filter((m) => m.direction === 'above' || (m.direction === 'none' && (m.percentChange ?? 0) >= 0)).map((m) => byId.get(m.indicatorId)!.def.label.toLowerCase())
    const ordinaryShare = core.length ? core.reduce((s, m) => s + m.ordinaryReadingShare, 0) / core.length : 0
    const end = p.active ? day : p.lastDay
    const movement: string[] = []
    if (lower.length) movement.push(`${list(lower)} ${lower.length === 1 ? 'has' : 'have'} moved below baseline`)
    if (higher.length) movement.push(`${list(higher)} ${higher.length === 1 ? 'has' : 'have'} moved above baseline`)
    const verbTense = p.active ? 'have shifted' : 'shifted'
    const narrative =
      `${core.length} health indicators across ${p.categories.length} categories ${verbTense} from their respective personal baselines during an overlapping period (mission days ${p.startDay}–${end}). ` +
      `${movement.join(', while ')}. ` +
      `On ${Math.round(ordinaryShare * 100)}% of days in this period, each individual reading was within that indicator's ordinary day-to-day range; the pattern appears when readings are smoothed over time and considered together. ` +
      (p.membersBelowOwnLimitAtDetection > 0
        ? `When the pattern was first reported on day ${p.detectedDay}, ${p.membersBelowOwnLimitAtDetection} of its ${core.length} indicators had not yet shown a sustained deviation on their own. `
        : '') +
      (p.active ? 'These changes warrant further review. ' : `The joint criteria were last met on day ${p.lastDay}. `) +
      'Available observations do not establish a medical condition or explain the cause.'

    insights.push({
      id: `CE-PAT-${p.id}`,
      kind: 'multivariable-pattern',
      title: `${core.length} indicators shifted together`,
      narrative,
      indicators: tls.map((tl) => toInsightIndicator(tl, tl.states[day - 1])),
      dateRange: { startDay: p.startDay, endDay: p.active ? null : p.lastDay },
      active: p.active,
      calculations: [
        { label: 'Personal baselines', value: `${tls.length} indicators`, detail: `Median and scaled median absolute deviation of each indicator's own baseline window (${cfg.baseline.mode === 'reference' ? `first ${cfg.baseline.referenceDays} mission days` : `trailing ${cfg.baseline.rollingWindowDays} days`}).` },
        { label: 'Smoothing', value: `EWMA, λ = ${lambda}`, detail: 'Each reading is converted to a robust z-score and exponentially smoothed. Control limits are widened for the autocorrelation seen in the baseline window.' },
        { label: 'Joint statistic (MEWMA T²)', value: p.t2Today !== null && p.limit !== null ? `${fmt(p.t2Today, 1)} against a limit of ${fmt(p.limit, 1)}` : `peak ${fmt(p.peakT2, 1)}`, detail: `Smoothed deviations of all regularly sampled indicators, weighed against their baseline correlations (shrinkage ${cfg.joint.shrinkage}). The limit corresponds to a false-alarm rate of ${cfg.joint.alpha * 100}% per day under baseline behaviour.` },
        { label: 'Membership', value: `${core.length} core indicators`, detail: `An indicator is a member on days when its smoothed shift is at least ${cfg.limits.member} control-limit units. Core members met this on at least ${Math.round(cfg.pattern.coreFraction * 100)}% of pattern days.` },
        { label: 'Persistence', value: `${p.durationDays} days`, detail: `Reported after the joint criteria held for ${cfg.pattern.minDays} days. Criteria require at least ${cfg.pattern.minIndicators} indicators from at least ${cfg.pattern.minCategories} categories.` },
        { label: 'Model tail probability', value: tailText(p.tailProbability), detail: 'Chance of a joint statistic this large on a single day if the baseline model still held. It measures departure from baseline, not the probability of illness.' },
        ...(p.leadDays !== null && p.leadDays > 0 ? [{ label: 'Lead over single-indicator limits', value: `${p.leadDays} days`, detail: 'Days between the pattern being reported and the first core indicator reaching a sustained deviation on its own.' }] : []),
      ],
      completeness: completenessOver(tls, p.startDay, end),
      evidence: {
        strength: p.strength,
        statement: `${p.strength.charAt(0).toUpperCase() + p.strength.slice(1)} statistical evidence that these measurements, taken together, differ from this person's baseline period. This grade reflects the number of indicators, persistence and data completeness. It is not medical certainty.`,
      },
      limitations: [
        NOT_A_DIAGNOSIS,
        'Indicators that change together are not necessarily related to each other; a shared influence such as workload or schedule can move several at once.',
        'The joint model is estimated from the same baseline window it is compared against, which makes early false alarms somewhat more likely than the nominal rate.',
        BASELINE_CAVEAT,
      ],
      reviewSteps: [
        'Open each member indicator to inspect its measurements against its baseline.',
        'Compare the onset with logged mission events for the same period.',
        'Check data completeness and any rejected readings in the window.',
        'Raise the pattern at the next scheduled medical conference, as mission protocol directs.',
      ],
      provenance: 'statistical-estimate',
    })
  }

  // ---- Sustained deviations of individual indicators ----------------------
  for (const ep of episodes) {
    if (!ep.sustained || ep.startDay > day) continue
    const active = ep.endDay >= day - 2
    if (!active && day - ep.endDay > 21) continue
    const tl = byId.get(ep.indicatorId)!
    const s = stateOf(ep.indicatorId)
    const end = Math.min(day, ep.endDay)
    const b = s.baseline
    insights.push({
      id: `CE-SUS-${ep.id}`,
      kind: 'sustained-deviation',
      title: `${tl.def.label}: sustained ${ep.direction === 'above' ? 'rise above' : 'fall below'} baseline`,
      narrative:
        `${tl.def.label} ${active ? 'has been' : 'was'} persistently ${ep.direction} this person's baseline from mission day ${ep.startDay}${active ? '' : ` to day ${ep.endDay}`}. ` +
        (b ? `The recent median is ${fmt(s.recentMedian, tl.def.decimals)} ${tl.def.unit} against a baseline median of ${fmt(b.median, tl.def.decimals)} ${tl.def.unit}${s.percentChange !== null ? ` (${s.percentChange > 0 ? '+' : ''}${fmt(s.percentChange, 0)}%)` : ''}. ` : '') +
        'The measurement alone does not indicate why.',
      indicators: [toInsightIndicator(tl, s)],
      dateRange: { startDay: ep.startDay, endDay: active ? null : ep.endDay },
      active,
      calculations: [
        { label: 'Robust z of latest reading', value: fmt(s.z, 2), detail: '(value − baseline median) ÷ (1.4826 × median absolute deviation).' },
        { label: 'Smoothed shift', value: `${fmt(s.shift, 2)} control-limit units`, detail: `EWMA of robust z (λ = ${lambda}) divided by its expected standard deviation under baseline behaviour. The control limit is ±${cfg.limits.sustained}.` },
        { label: 'Peak shift', value: `${fmt(ep.peakShift, 2)} on day ${ep.peakDay}`, detail: 'Largest smoothed shift during this episode.' },
        { label: 'Persistence rule', value: `${cfg.limits.sustainedMinObservations} consecutive observations`, detail: 'A deviation is called sustained only after the limit is exceeded on this many observations in a row.' },
      ],
      completeness: completenessOver([tl], ep.startDay, end),
      evidence: { strength: Math.abs(ep.peakShift) >= 1.5 * cfg.limits.sustained ? 'strong' : 'moderate', statement: 'Evidence that this single indicator differs from its own baseline. This is not medical certainty.' },
      limitations: [NOT_A_DIAGNOSIS, BASELINE_CAVEAT, 'A single indicator can shift for reasons unrelated to health, including sensor placement, schedule and environment.'],
      reviewSteps: ['Inspect the measurement history for the episode.', 'Check whether other indicators changed over the same days.', 'Compare with logged mission events.'],
      provenance: 'statistical-estimate',
    })
  }

  // ---- Unusual isolated changes ------------------------------------------
  for (const tl of timelines) {
    const s = tl.states[day - 1]
    if (s.status !== 'unusual') continue
    const outlier = s.z !== null && Math.abs(s.z) >= cfg.limits.outlierZ
    insights.push({
      id: `CE-UNU-${tl.def.id}-${day}`,
      kind: 'unusual-change',
      title: `${tl.def.label}: unusual ${outlier ? 'reading' : 'recent change'}`,
      narrative: outlier
        ? `Today's ${tl.def.label.toLowerCase()} reading of ${fmt(s.value, tl.def.decimals)} ${tl.def.unit} is far from this person's baseline (${fmt(s.baseline?.median ?? null, tl.def.decimals)} ${tl.def.unit}). A single reading like this can reflect an activity, the environment or the sensor; it is not, on its own, a sustained change.`
        : `${tl.def.label} has recently moved beyond its control limit but has not yet stayed there long enough to be called sustained.`,
      indicators: [toInsightIndicator(tl, s)],
      dateRange: { startDay: day, endDay: day },
      active: true,
      calculations: [
        { label: 'Robust z of latest reading', value: fmt(s.z, 2), detail: `Readings beyond ±${cfg.limits.outlierZ} are treated as outliers (modified z-score convention).` },
        { label: 'Smoothed shift', value: `${fmt(s.shift, 2)} control-limit units`, detail: `Observations in a row beyond the limit: ${s.runLength} of the ${cfg.limits.sustainedMinObservations} required for a sustained deviation.` },
      ],
      completeness: completenessOver([tl], Math.max(1, day - 13), day),
      evidence: { strength: 'limited', statement: 'Limited evidence: one or a few readings. This is not medical certainty.' },
      limitations: [NOT_A_DIAGNOSIS, 'Isolated readings are common and frequently have ordinary explanations.'],
      reviewSteps: ['Check logged events for that day.', 'See whether the next readings return to the ordinary range.'],
      provenance: 'statistical-estimate',
    })
  }

  // ---- Gradual trends -----------------------------------------------------
  for (const tl of timelines) {
    const s = tl.states[day - 1]
    if (s.status !== 'drifting' || !s.trend) continue
    insights.push({
      id: `CE-TRD-${tl.def.id}`,
      kind: 'gradual-trend',
      title: `${tl.def.label}: gradual ${s.trend.slopePerDay > 0 ? 'upward' : 'downward'} trend`,
      narrative: `${tl.def.label} has changed gradually over the last ${s.trend.windowDays} days (${s.trend.slopePerDay > 0 ? '+' : ''}${fmt(s.trend.slopePerDay * 7, tl.def.decimals + 1)} ${tl.def.unit} per week). The change is statistically detectable but has not crossed the indicator's own control limit. Some gradual change is an expected part of adapting to spaceflight.`,
      indicators: [toInsightIndicator(tl, s)],
      dateRange: { startDay: Math.max(1, day - s.trend.windowDays + 1), endDay: null },
      active: true,
      calculations: [
        { label: 'Theil–Sen slope', value: `${fmt(s.trend.slopePerDay * 7, tl.def.decimals + 1)} ${tl.def.unit}/week`, detail: 'Median of all pairwise slopes in the window; resistant to outliers.' },
        { label: 'Mann–Kendall test', value: `p = ${s.trend.pValue < 0.001 ? '< 0.001' : s.trend.pValue.toFixed(3)}`, detail: `Nonparametric test for a monotonic trend across ${s.trend.n} observations.` },
        { label: 'Total change', value: `${fmt(s.trend.totalChangeSd, 1)} robust SD`, detail: 'Slope multiplied by the span of the window, in units of baseline variability.' },
      ],
      completeness: completenessOver([tl], Math.max(1, day - s.trend.windowDays + 1), day),
      evidence: { strength: 'moderate', statement: 'Moderate evidence of a gradual change. This is not medical certainty.' },
      limitations: [NOT_A_DIAGNOSIS, BASELINE_CAVEAT],
      reviewSteps: ['Inspect the trend over a longer window.', 'Compare with the expected course for this phase of the mission.'],
      provenance: 'statistical-estimate',
    })
  }

  // ---- Recorded-action follow-up ------------------------------------------
  for (const r of responses) {
    if (r.action.day > day) continue
    const tls = r.indicators.filter((i) => i.isTarget).map((i) => byId.get(i.indicatorId)!)
    insights.push({
      id: `CE-RSP-${r.actionId}`,
      kind: 'response-evaluation',
      title: `After recorded action: ${r.action.label}`,
      narrative: r.summary,
      indicators: tls.map((tl) => toInsightIndicator(tl, tl.states[day - 1])),
      dateRange: { startDay: r.preWindow[0], endDay: r.status === 'evaluated' ? r.postWindow[1] : null },
      active: r.status !== 'evaluated',
      calculations: [
        { label: 'Comparison windows', value: `days ${r.preWindow[0]}–${r.preWindow[1]} vs ${r.postWindow[0]}–${r.postWindow[1]}`, detail: `${cfg.response.preDays} days before the recorded action against up to ${cfg.response.postDays} days after.` },
        { label: 'Distance from baseline', value: `${r.targetsTowardBaseline} of ${r.targetsEvaluated} designated indicators closer`, detail: 'Window medians expressed in robust-SD units from the personal baseline, before and after.' },
        { label: 'Difference test', value: 'Mann–Whitney U', detail: `A movement is reported only when the two windows differ (p < ${cfg.response.alpha}) and the distance from baseline changes by at least ${cfg.response.minDistanceChange} robust SD.` },
      ],
      completeness: completenessOver(tls, r.preWindow[0], Math.max(r.preWindow[1], r.postWindow[1])),
      evidence: { strength: r.status === 'evaluated' ? 'moderate' : 'limited', statement: 'This grade describes how much data supports the before/after description. It says nothing about whether the action caused the change.' },
      limitations: r.limitations,
      reviewSteps: ['Review the context events listed with this comparison.', 'Continue observing; a longer follow-up gives a clearer picture.'],
      provenance: 'statistical-estimate',
    })
  }

  // ---- Insufficient evidence ----------------------------------------------
  for (const tl of timelines) {
    const s = tl.states[day - 1]
    if (s.status !== 'insufficient-data' && s.status !== 'stale') continue
    const stale = s.status === 'stale'
    insights.push({
      id: `CE-INS-${tl.def.id}`,
      kind: 'insufficient-evidence',
      title: `${tl.def.label}: ${stale ? 'no recent observations' : 'baseline not yet established'}`,
      narrative: stale
        ? `The last ${tl.def.label.toLowerCase()} observation was on mission day ${s.lastObservedDay ?? '—'}. No conclusion is drawn for the current day.`
        : `There are not yet enough ${tl.def.label.toLowerCase()} observations to describe what is typical for this person, so no comparison is made.`,
      indicators: [toInsightIndicator(tl, s)],
      dateRange: { startDay: stale ? (s.lastObservedDay ?? day) : 1, endDay: null },
      active: true,
      calculations: [{ label: 'Observations available', value: `${s.baseline?.n ?? 0}`, detail: `Collected ${tl.def.cadenceDays === 1 ? 'daily' : `about every ${tl.def.cadenceDays} days`}. ${tl.def.collection}` }],
      completeness: completenessOver([tl], Math.max(1, day - 13), day),
      evidence: { strength: 'not-applicable', statement: 'No statistical conclusion is drawn.' },
      limitations: ['Absence of an alert here reflects missing data, not a normal result.'],
      reviewSteps: ['Check the collection schedule and device status.'],
      provenance: 'statistical-estimate',
    })
  }

  // ---- Normal variation -----------------------------------------------------
  const normal = timelines.filter((tl) => tl.states[day - 1].status === 'normal')
  if (normal.length > 0) {
    insights.push({
      id: 'CE-NRM',
      kind: 'normal-variation',
      title: `${normal.length} indicator${normal.length === 1 ? '' : 's'} within ordinary variation`,
      narrative: `${list(normal.map((tl) => tl.def.label))} ${normal.length === 1 ? 'is' : 'are'} varying within the range this person showed during the baseline window.`,
      indicators: normal.map((tl) => toInsightIndicator(tl, tl.states[day - 1])),
      dateRange: { startDay: Math.max(1, day - 6), endDay: day },
      active: true,
      calculations: [{ label: 'Criterion', value: `|shift| < ${cfg.limits.sustained}`, detail: 'Smoothed shift inside the control limit, no outlying reading today and no detectable trend.' }],
      completeness: completenessOver(normal, Math.max(1, day - 13), day),
      evidence: { strength: 'not-applicable', statement: 'Ordinary variation relative to the personal baseline.' },
      limitations: [BASELINE_CAVEAT],
      reviewSteps: [],
      provenance: 'statistical-estimate',
    })
  }

  return insights
}
