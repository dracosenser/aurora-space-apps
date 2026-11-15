// ---------------------------------------------------------------------------
// CONSTELLATION ENGINE — configuration
//
// Every threshold is a statistical convention stated in units of each person's
// own variability. None is a clinical cut-off, and all are configurable.
// ---------------------------------------------------------------------------

export interface EngineConfig {
  baseline: {
    /**
     * 'reference': a fixed early-mission window (suits a mission with a stable start).
     * 'rolling': a trailing window that follows slow adaptation (suits long missions
     * where expected physiological drift would otherwise dominate).
     */
    mode: 'reference' | 'rolling'
    referenceDays: number
    rollingWindowDays: number
    /** Days between the end of the rolling window and the day being assessed. */
    rollingGapDays: number
    /** Minimum observations before a baseline is used at all (daily-cadence indicators). */
    minObservations: number
    /** Minimum observations for sparse (e.g. weekly) indicators. */
    minSparseObservations: number
  }
  /** EWMA smoothing weight for the newest observation. */
  ewmaLambda: number
  limits: {
    /** |shift| at which an indicator counts as a member of a joint pattern. */
    member: number
    /** |shift| control limit for an individual indicator (classic L = 3). */
    sustained: number
    /** |robust z| for a single reading to count as an outlier (Iglewicz–Hoaglin convention). */
    outlierZ: number
    /** Consecutive observations beyond the limit before a deviation is called sustained. */
    sustainedMinObservations: number
    sustainedMinSparse: number
  }
  staleness: { minDays: number; cadenceMultiplier: number }
  trend: {
    windowDays: number
    minObservations: number
    minSparseObservations: number
    alpha: number
    /** Minimum total change over the window, in robust-SD units. */
    minTotalChangeSd: number
  }
  joint: {
    /** False-alarm rate per day used to set the T² control limit. */
    alpha: number
    /** Shrinkage of the baseline correlation matrix toward identity (0–1). */
    shrinkage: number
    minVariables: number
  }
  pattern: {
    minIndicators: number
    minCategories: number
    /** Days the joint criteria must hold before a pattern is reported. */
    minDays: number
    /** Days the criteria may lapse without ending the episode. */
    gapDays: number
    /** Duration at which an active pattern is described as sustained. */
    sustainedDays: number
    /** Share of pattern days an indicator must be a member to be a core member. */
    coreFraction: number
  }
  relationship: {
    maxLagDays: number
    detrendWindowDays: number
    minPairs: number
    minEffectiveN: number
    alpha: number
    minAbsRho: number
    maxAcfLag: number
  }
  response: {
    preDays: number
    postDays: number
    /** Minimum observations in each window (daily cadence) before a comparison is made. */
    minObservations: number
    minSparseObservations: number
    /** Minimum change in distance from baseline (robust-SD units) to call a movement. */
    minDistanceChange: number
    alpha: number
    /** |z| under which a window is described as already near baseline. */
    nearBaselineZ: number
  }
}

export const DEFAULT_CONFIG: EngineConfig = {
  baseline: {
    mode: 'reference',
    referenceDays: 40,
    rollingWindowDays: 45,
    rollingGapDays: 10,
    minObservations: 14,
    minSparseObservations: 5,
  },
  ewmaLambda: 0.25,
  limits: {
    member: 2,
    sustained: 3,
    outlierZ: 3.5,
    sustainedMinObservations: 5,
    sustainedMinSparse: 2,
  },
  staleness: { minDays: 3, cadenceMultiplier: 2 },
  trend: {
    windowDays: 21,
    minObservations: 10,
    minSparseObservations: 6,
    alpha: 0.01,
    minTotalChangeSd: 1,
  },
  joint: { alpha: 0.001, shrinkage: 0.3, minVariables: 3 },
  pattern: {
    minIndicators: 3,
    minCategories: 2,
    minDays: 5,
    gapDays: 2,
    sustainedDays: 14,
    coreFraction: 0.5,
  },
  relationship: {
    maxLagDays: 3,
    detrendWindowDays: 15,
    minPairs: 30,
    minEffectiveN: 20,
    alpha: 0.05,
    minAbsRho: 0.25,
    maxAcfLag: 10,
  },
  response: {
    preDays: 14,
    postDays: 14,
    minObservations: 7,
    minSparseObservations: 2,
    minDistanceChange: 0.5,
    alpha: 0.05,
    nearBaselineZ: 0.75,
  },
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

export function resolveConfig(partial?: DeepPartial<EngineConfig>): EngineConfig {
  if (!partial) return DEFAULT_CONFIG
  const out = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as EngineConfig
  const merge = (target: Record<string, unknown>, source: Record<string, unknown>) => {
    for (const key of Object.keys(source)) {
      const sv = source[key]
      if (sv === undefined) continue
      if (sv !== null && typeof sv === 'object' && !Array.isArray(sv)) merge(target[key] as Record<string, unknown>, sv as Record<string, unknown>)
      else target[key] = sv
    }
  }
  merge(out as unknown as Record<string, unknown>, partial as Record<string, unknown>)
  return out
}
