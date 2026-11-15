// ---------------------------------------------------------------------------
// CONSTELLATION ENGINE — plain-language descriptions of analysis states
// ---------------------------------------------------------------------------

import type { IndicatorDayState, IndicatorDef, IndicatorStatus } from './types'
import type { EngineConfig } from './config'

export const STATUS_LABEL: Record<IndicatorStatus, string> = {
  'insufficient-data': 'Baseline not established',
  stale: 'No recent data',
  normal: 'Ordinary variation',
  unusual: 'Unusual change',
  drifting: 'Gradual trend',
  sustained: 'Sustained deviation',
}

function num(v: number | null, d: number): string {
  if (v === null || !Number.isFinite(v)) return '—'
  return v.toFixed(d).replace('-', '−')
}

/** Explain, in one or two sentences, why an indicator has the status it has on a given day. */
export function describeIndicatorState(def: IndicatorDef, s: IndicatorDayState, cfg: EngineConfig): string {
  const b = s.baseline
  switch (s.status) {
    case 'insufficient-data':
      return `Only ${b?.n ?? 0} usable observation${(b?.n ?? 0) === 1 ? '' : 's'} so far. A personal baseline needs more before any comparison is made.`
    case 'stale':
      return `The last observation was on mission day ${s.lastObservedDay ?? '—'}. Without recent data no conclusion is drawn for this day.`
    case 'sustained':
      return `The smoothed deviation has been beyond the control limit (±${cfg.limits.sustained}) for ${s.runLength} observations in a row, ${s.direction} this person's baseline of ${num(b?.median ?? null, def.decimals)} ${def.unit}.`
    case 'unusual':
      if (s.z !== null && Math.abs(s.z) >= cfg.limits.outlierZ) {
        return `Today's reading is ${num(Math.abs(s.z), 1)} robust standard deviations ${s.z > 0 ? 'above' : 'below'} baseline. One reading like this is not a sustained change.`
      }
      return `The smoothed deviation has crossed the control limit but has not stayed there for the ${cfg.limits.sustainedMinObservations} observations required to call it sustained.`
    case 'drifting':
      return s.trend
        ? `A gradual ${s.trend.slopePerDay > 0 ? 'upward' : 'downward'} trend is detectable over the last ${s.trend.windowDays} days (Mann–Kendall p ${s.trend.pValue < 0.001 ? '< 0.001' : '= ' + s.trend.pValue.toFixed(3)}), though the control limit has not been crossed.`
        : 'A gradual trend is detectable.'
    default: {
      const member = s.shift !== null && Math.abs(s.shift) >= cfg.limits.member
      return member
        ? `Within its own control limit, but the smoothed deviation (${num(s.shift, 1)}) is large enough to count toward a joint pattern if other indicators shift at the same time.`
        : `Varying within the range seen during this person's baseline window.`
    }
  }
}

/** A one-line, data-driven caption for a mission day (used by replay). */
export function describeDay(args: {
  day: number
  referenceEnd: number
  counts: Record<IndicatorStatus, number>
  members: number
  jointRatio: number | null
  patternStage: 'emerging' | 'sustained' | 'resolved' | null
  patternDetectedToday: boolean
  patternSize: number
  actionToday: string | null
}): string {
  const { day, referenceEnd, counts, members, jointRatio, patternStage, patternDetectedToday, patternSize, actionToday } = args
  if (actionToday) return `Day ${day}: recorded action, ${actionToday.toLowerCase()}. Follow-up comparison begins.`
  if (day <= referenceEnd) return `Day ${day}: establishing personal baselines (${counts['insufficient-data']} indicator${counts['insufficient-data'] === 1 ? '' : 's'} still without one).`
  if (patternDetectedToday) return `Day ${day}: joint pattern reported. ${patternSize} indicators have been shifted together for long enough to rule out a passing fluctuation.`
  if (patternStage === 'sustained') return `Day ${day}: the joint pattern is sustained across ${patternSize} indicators. ${counts.sustained} of them ${counts.sustained === 1 ? 'is' : 'are'} individually beyond ${counts.sustained === 1 ? 'its' : 'their'} own limit.`
  if (patternStage === 'emerging') return `Day ${day}: joint pattern emerging across ${patternSize} indicators.`
  if (jointRatio !== null && jointRatio >= 0.6 && members >= 2) return `Day ${day}: ${members} indicators are shifted at once; the joint statistic is at ${Math.round(jointRatio * 100)}% of its limit.`
  if (members >= 1) return `Day ${day}: ${members} indicator${members === 1 ? ' is' : 's are'} modestly shifted; nothing sustained.`
  if (patternStage === 'resolved') return `Day ${day}: the earlier joint pattern is no longer present.`
  return `Day ${day}: all indicators within ordinary personal variation.`
}
