// ---------------------------------------------------------------------------
// CONSTELLATION ENGINE — personal baselines and per-indicator deviation
//
// For each indicator this produces one state per mission day, using only the
// observations available on or before that day (so the mission can be replayed
// exactly as the engine would have seen it).
// ---------------------------------------------------------------------------

import type { BaselineStats, DeviationEpisode, IndicatorDayState, IndicatorDef, IndicatorStatus, IndicatorTimeline, TrendEstimate } from './types'
import type { EngineConfig } from './config'
import { MAD_SCALE, autocorr, ewmaSigma, mad, mannKendall, mean, quantileSorted, sd, sortedCopy, theilSen } from './robust'

export function isSparse(def: IndicatorDef): boolean {
  return def.cadenceDays > 2
}

/** Plausibility screening: removes non-finite values and sensor glitches outside the physical range. */
export function screenSeries(def: IndicatorDef, raw: readonly (number | null)[], totalDays: number): { clean: (number | null)[]; rejectedDays: number[] } {
  const clean: (number | null)[] = new Array(totalDays).fill(null)
  const rejectedDays: number[] = []
  for (let i = 0; i < totalDays; i++) {
    const v = i < raw.length ? raw[i] : null
    if (v === null || v === undefined) continue
    if (!Number.isFinite(v) || v < def.plausibleRange[0] || v > def.plausibleRange[1]) {
      rejectedDays.push(i + 1)
      continue
    }
    clean[i] = v
  }
  return { clean, rejectedDays }
}

/** Descriptive and robust statistics for a baseline window (inclusive days). */
export function computeBaseline(
  def: IndicatorDef,
  clean: readonly (number | null)[],
  windowStart: number,
  windowEnd: number,
  minObs: number,
  established: boolean,
  lambda: number,
): BaselineStats | null {
  if (windowEnd < windowStart) return null
  const values: number[] = []
  const windowSeries: (number | null)[] = []
  for (let d = windowStart; d <= windowEnd; d++) {
    const v = clean[d - 1]
    windowSeries.push(v)
    if (v !== null) values.push(v)
  }
  const n = values.length
  const expected = Math.max(1, Math.round((windowEnd - windowStart + 1) / def.cadenceDays))
  if (n < Math.max(3, Math.ceil(minObs / 2))) return null
  const sorted = sortedCopy(values)
  const med = quantileSorted(sorted, 0.5)
  const rawMad = mad(values, med)
  const scale = Math.max(MAD_SCALE * rawMad, def.resolution)
  // Autocorrelation is only meaningful for regularly sampled series.
  const phi = isSparse(def) ? 0 : Math.max(0, autocorr(windowSeries, 1))
  // The baseline centre is itself an estimate. The sampling variance of a median is
  // about (π/2)/n in SD units; adding it widens the limits for short or sparse baselines.
  const ewmaSd = ewmaSigma(lambda, phi)
  const sigmaE = Math.sqrt(ewmaSd * ewmaSd + Math.PI / 2 / n)
  return {
    status: n < minObs ? 'insufficient' : established ? 'established' : 'provisional',
    n,
    expected,
    completeness: Math.min(1, n / expected),
    windowStart,
    windowEnd,
    median: med,
    mad: rawMad,
    scale,
    mean: mean(values),
    sd: sd(values),
    q1: quantileSorted(sorted, 0.25),
    q3: quantileSorted(sorted, 0.75),
    min: sorted[0],
    max: sorted[n - 1],
    phi,
    sigmaE,
  }
}

function computeTrend(def: IndicatorDef, clean: readonly (number | null)[], day: number, scale: number, cfg: EngineConfig): TrendEstimate | null {
  const sparse = isSparse(def)
  const windowDays = Math.max(cfg.trend.windowDays, 8 * def.cadenceDays)
  const minObs = sparse ? cfg.trend.minSparseObservations : cfg.trend.minObservations
  const xs: number[] = []
  const ys: number[] = []
  for (let d = Math.max(1, day - windowDays + 1); d <= day; d++) {
    const v = clean[d - 1]
    if (v !== null) {
      xs.push(d)
      ys.push(v)
    }
  }
  if (ys.length < minObs) return null
  const { slope } = theilSen(xs, ys)
  const mk = mannKendall(ys)
  const span = xs[xs.length - 1] - xs[0]
  return {
    slopePerDay: slope,
    slopeSdPerWeek: (slope * 7) / scale,
    totalChangeSd: (slope * span) / scale,
    pValue: mk.pValue,
    n: ys.length,
    windowDays,
  }
}

/** Reference-window end for an indicator: long enough to gather the minimum observations at its cadence. */
export function referenceEndFor(def: IndicatorDef, cfg: EngineConfig): number {
  const minObs = isSparse(def) ? cfg.baseline.minSparseObservations : cfg.baseline.minObservations
  return Math.max(cfg.baseline.referenceDays, Math.ceil(minObs * def.cadenceDays * 1.15))
}

export function computeIndicatorTimeline(def: IndicatorDef, raw: readonly (number | null)[], totalDays: number, cfg: EngineConfig): IndicatorTimeline {
  const { clean, rejectedDays } = screenSeries(def, raw, totalDays)
  const rejected = new Set(rejectedDays)
  const sparse = isSparse(def)
  const minObs = sparse ? cfg.baseline.minSparseObservations : cfg.baseline.minObservations
  const sustainedObs = sparse ? cfg.limits.sustainedMinSparse : cfg.limits.sustainedMinObservations
  const referenceEnd = referenceEndFor(def, cfg)
  const lambda = cfg.ewmaLambda
  const staleAfter = Math.max(cfg.staleness.minDays, cfg.staleness.cadenceMultiplier * def.cadenceDays + 1)

  const states: IndicatorDayState[] = []
  let frozen: BaselineStats | null | undefined
  let ewma: number | null = null
  let lastValue: number | null = null
  let lastObservedDay: number | null = null
  let runLength = 0
  let runSign = 0

  for (let day = 1; day <= totalDays; day++) {
    // --- Personal baseline as known on this day (never includes today's value).
    let baseline: BaselineStats | null
    if (cfg.baseline.mode === 'reference') {
      if (day > referenceEnd) {
        if (frozen === undefined) frozen = computeBaseline(def, clean, 1, referenceEnd, minObs, true, lambda)
        baseline = frozen
      } else {
        baseline = computeBaseline(def, clean, 1, day - 1, minObs, false, lambda)
      }
    } else {
      const end = day - cfg.baseline.rollingGapDays - 1
      const start = Math.max(1, end - cfg.baseline.rollingWindowDays + 1)
      const rolling = end - start + 1 >= Math.min(cfg.baseline.rollingWindowDays, minObs * def.cadenceDays) ? computeBaseline(def, clean, start, end, minObs, true, lambda) : null
      baseline = rolling && rolling.status !== 'insufficient' ? rolling : computeBaseline(def, clean, 1, day - 1, minObs, false, lambda)
    }
    const usable = baseline !== null && baseline.status !== 'insufficient'

    // --- Today's observation.
    const value = clean[day - 1]
    let z: number | null = null
    if (value !== null) {
      lastValue = value
      lastObservedDay = day
      if (usable && baseline) {
        z = (value - baseline.median) / baseline.scale
        // Winsorise before smoothing so one or two extreme readings cannot masquerade as a sustained shift.
        const zc = Math.max(-cfg.limits.outlierZ, Math.min(cfg.limits.outlierZ, z))
        ewma = lambda * zc + (1 - lambda) * (ewma ?? 0)
        const shiftNow = ewma / baseline.sigmaE
        const sign = Math.sign(shiftNow)
        if (Math.abs(shiftNow) >= cfg.limits.sustained) {
          runLength = sign === runSign ? runLength + 1 : 1
          runSign = sign
        } else {
          runLength = 0
          runSign = 0
        }
      }
    }
    const shift = usable && baseline && ewma !== null ? ewma / baseline.sigmaE : null

    // --- Recent level and completeness.
    const recentWindow = sparse ? def.cadenceDays * 2 + 1 : 7
    const recent: number[] = []
    for (let d = Math.max(1, day - recentWindow + 1); d <= day; d++) {
      const v = clean[d - 1]
      if (v !== null) recent.push(v)
    }
    const recentMedian = recent.length ? quantileSorted(sortedCopy(recent), 0.5) : null
    let observed14 = 0
    const span14 = Math.min(14, day)
    for (let d = day - span14 + 1; d <= day; d++) if (clean[d - 1] !== null) observed14++
    const recentCompleteness = Math.min(1, observed14 / Math.max(1, span14 / def.cadenceDays))

    const percentChange = usable && baseline && recentMedian !== null && Math.abs(baseline.median) > 1e-9 ? ((recentMedian - baseline.median) / Math.abs(baseline.median)) * 100 : null
    const trend = usable && baseline ? computeTrend(def, clean, day, baseline.scale, cfg) : null

    // --- Status.
    const stale = lastObservedDay === null || day - lastObservedDay > staleAfter
    let status: IndicatorStatus
    if (!usable) status = 'insufficient-data'
    else if (stale) status = 'stale'
    else if (shift !== null && Math.abs(shift) >= cfg.limits.sustained && runLength >= sustainedObs) status = 'sustained'
    else if (z !== null && Math.abs(z) >= cfg.limits.outlierZ) status = 'unusual'
    else if (
      // A change that arrives as a statistically detectable ramp is described as gradual,
      // whether or not the control limit has been touched yet.
      trend &&
      trend.pValue < cfg.trend.alpha &&
      Math.abs(trend.totalChangeSd) >= cfg.trend.minTotalChangeSd &&
      shift !== null &&
      Math.abs(shift) >= 1 &&
      Math.sign(trend.slopePerDay) === Math.sign(shift)
    )
      status = 'drifting'
    else if (shift !== null && Math.abs(shift) >= cfg.limits.sustained) status = 'unusual'
    else status = 'normal'

    states.push({
      indicatorId: def.id,
      day,
      value,
      lastValue,
      lastObservedDay,
      baseline: baseline ?? null,
      z,
      ewma: usable ? ewma : null,
      shift,
      recentMedian,
      percentChange,
      trend,
      status,
      direction: shift === null || Math.abs(shift) < 1 ? 'none' : shift > 0 ? 'above' : 'below',
      runLength,
      recentCompleteness,
      rejectedToday: rejected.has(day),
    })
  }

  return { def, clean, rejectedDays, states, referenceEnd }
}

/** Contiguous runs where an indicator's smoothed shift is at or beyond its own control limit. */
export function findDeviationEpisodes(timeline: IndicatorTimeline, cfg: EngineConfig): DeviationEpisode[] {
  const episodes: DeviationEpisode[] = []
  const gap = Math.max(2, timeline.def.cadenceDays * 2)
  let current: DeviationEpisode | null = null
  let lastHit = -Infinity
  for (const s of timeline.states) {
    const beyond = s.shift !== null && Math.abs(s.shift) >= cfg.limits.sustained && s.status !== 'stale' && s.status !== 'insufficient-data'
    if (beyond && s.shift !== null) {
      const dir = s.shift > 0 ? 'above' : 'below'
      if (current && current.direction === dir && s.day - lastHit <= gap + 1) {
        current.endDay = s.day
        if (Math.abs(s.shift) > Math.abs(current.peakShift)) {
          current.peakShift = s.shift
          current.peakDay = s.day
        }
      } else {
        if (current) episodes.push(current)
        current = {
          id: `${timeline.def.id}-${s.day}`,
          indicatorId: timeline.def.id,
          startDay: s.day,
          endDay: s.day,
          direction: dir,
          peakShift: s.shift,
          peakDay: s.day,
          sustained: false,
        }
      }
      if (s.status === 'sustained') current.sustained = true
      lastHit = s.day
    } else if (current && s.day - lastHit > gap) {
      episodes.push(current)
      current = null
    }
  }
  if (current) episodes.push(current)
  return episodes
}
