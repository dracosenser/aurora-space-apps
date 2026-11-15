// ---------------------------------------------------------------------------
// CONSTELLATION ENGINE — domain types
//
// The engine is a pure TypeScript library. It has no dependency on React, the
// DOM, or any rendering code, and can run in Node (see scripts/ and tests).
// ---------------------------------------------------------------------------

/** Where a number came from. The UI must never blur these categories. */
export type Provenance =
  | 'synthetic-demo' // generated for the demonstration; not a real measurement
  | 'nasa-research' // taken from a cited NASA research dataset
  | 'user-entered' // typed in by the person using the application
  | 'imported' // loaded from a file or device export
  | 'statistical-estimate' // computed by the engine from other values

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  'synthetic-demo': 'Synthetic demonstration data',
  'nasa-research': 'NASA research data',
  'user-entered': 'User-entered',
  imported: 'Imported measurement',
  'statistical-estimate': 'Statistical estimate',
}

export interface CategoryDef {
  id: string
  label: string
  description: string
}

export interface IndicatorDef {
  id: string
  label: string
  shortLabel: string
  unit: string
  category: string
  decimals: number
  /** Expected days between observations: 1 = daily, 7 = weekly. */
  cadenceDays: number
  /** How the measurement is collected. Not every measurement comes from a wearable. */
  collection: string
  /** Physically plausible range, used only to screen out sensor glitches. Not a clinical range. */
  plausibleRange: [number, number]
  /** Smallest meaningful increment of the instrument; floors the robust scale. */
  resolution: number
  provenance: Provenance
}

export interface MissionEventRecord {
  id: string
  day: number
  endDay?: number
  title: string
  description: string
  kind: 'operations' | 'environment' | 'systems' | 'medical' | 'schedule' | 'other'
}

/**
 * An action the crew member logged as completed under an approved mission
 * health protocol. The engine never recommends actions; it only compares
 * measurements before and after one that was recorded.
 */
export interface RecordedAction {
  id: string
  day: number
  label: string
  protocol: string
  /** Indicators the protocol itself designates for follow-up. */
  targetIndicators: string[]
  notes?: string
  provenance: Provenance
}

export interface MissionDataset {
  id: string
  name: string
  description: string
  subject: { id: string; name: string; role: string }
  totalDays: number
  categories: CategoryDef[]
  indicators: IndicatorDef[]
  /** series[indicatorId][day - 1] is the value for that mission day, or null when there was no observation. */
  series: Record<string, (number | null)[]>
  events: MissionEventRecord[]
  actions: RecordedAction[]
  provenance: Provenance
}

// ------------------------------------------------------------------ baseline

export type BaselineStatus = 'insufficient' | 'provisional' | 'established'

export interface BaselineStats {
  status: BaselineStatus
  /** Observations used. */
  n: number
  /** Observations that the cadence would have produced over the window. */
  expected: number
  completeness: number
  windowStart: number
  windowEnd: number
  median: number
  /** Raw median absolute deviation. */
  mad: number
  /** Robust standard deviation: 1.4826 × MAD, floored at the instrument resolution. */
  scale: number
  mean: number
  sd: number
  q1: number
  q3: number
  min: number
  max: number
  /** Lag-1 autocorrelation of the baseline observations (used to widen EWMA limits). */
  phi: number
  /** Standard deviation of the EWMA of robust z under baseline behaviour. */
  sigmaE: number
}

// ------------------------------------------------------------- daily state

export type IndicatorStatus =
  | 'insufficient-data' // no usable personal baseline yet
  | 'stale' // baseline exists but there is no recent observation
  | 'normal' // within ordinary personal variation
  | 'unusual' // an isolated or newly emerging departure
  | 'drifting' // a gradual, statistically detectable trend
  | 'sustained' // a persistent departure from the personal baseline

export interface TrendEstimate {
  /** Theil–Sen slope in measurement units per day. */
  slopePerDay: number
  /** Slope in robust-SD units per week. */
  slopeSdPerWeek: number
  /** Total change over the window in robust-SD units. */
  totalChangeSd: number
  /** Two-sided Mann–Kendall p-value. */
  pValue: number
  n: number
  windowDays: number
}

export interface IndicatorDayState {
  indicatorId: string
  day: number
  /** Today's observation after quality screening, or null. */
  value: number | null
  /** Most recent observation on or before this day. */
  lastValue: number | null
  lastObservedDay: number | null
  baseline: BaselineStats | null
  /** Robust z of today's value against the personal baseline. */
  z: number | null
  /** Exponentially weighted moving average of robust z. */
  ewma: number | null
  /** EWMA in control-limit units (ewma / sigmaE). */
  shift: number | null
  /** Median of the trailing week of observations. */
  recentMedian: number | null
  /** Recent median relative to the baseline median, in percent. */
  percentChange: number | null
  trend: TrendEstimate | null
  status: IndicatorStatus
  direction: 'above' | 'below' | 'none'
  /** Consecutive observations with |shift| at or beyond the sustained limit. */
  runLength: number
  /** Share of expected observations present over the trailing 14 days. */
  recentCompleteness: number
  /** True when today's raw reading was rejected by quality screening. */
  rejectedToday: boolean
}

export interface IndicatorTimeline {
  def: IndicatorDef
  /** Quality-screened series, index = day - 1. */
  clean: (number | null)[]
  /** Days whose raw reading failed plausibility screening. */
  rejectedDays: number[]
  /** One state per mission day, index = day - 1. */
  states: IndicatorDayState[]
  /** Last day of the reference window for this indicator. */
  referenceEnd: number
}

export interface DeviationEpisode {
  id: string
  indicatorId: string
  startDay: number
  endDay: number
  direction: 'above' | 'below'
  peakShift: number
  peakDay: number
  /** Whether the run met the sustained-observation requirement. */
  sustained: boolean
}

// ------------------------------------------------------------ joint statistic

export interface JointState {
  day: number
  /** Multivariate EWMA statistic (Hotelling-type T²). */
  t2: number
  /** Control limit for the number of variables available that day. */
  limit: number
  /** Model-based tail probability of a T² this large under baseline behaviour. */
  tailProbability: number
  exceeds: boolean
  variables: string[]
  /** Indicators whose own smoothed shift is at or beyond the member limit. */
  members: string[]
  categories: string[]
}

export type PatternStage = 'emerging' | 'sustained' | 'resolved'
export type EvidenceStrength = 'limited' | 'moderate' | 'strong'

export interface PatternEpisode {
  id: string
  startDay: number
  /** Last day on which the pattern criteria held. */
  endDay: number
  /** Day the minimum-duration requirement was first met. */
  detectedDay: number
  patternDays: number[]
  peakT2: number
  peakDay: number
}

export interface PatternMemberView {
  indicatorId: string
  /** Days (within the pattern so far) on which this indicator was a member. */
  memberDays: number
  shareOfDays: number
  shiftToday: number | null
  direction: 'above' | 'below' | 'none'
  percentChange: number | null
  /** Share of its individual daily readings during the pattern that were within ±2 robust SD. */
  ordinaryReadingShare: number
  /** First day its own control limit was crossed persistently, or null if never. */
  ownSustainedDay: number | null
}

export interface PatternView {
  id: string
  stage: PatternStage
  active: boolean
  startDay: number
  detectedDay: number
  lastDay: number
  durationDays: number
  members: PatternMemberView[]
  coreMemberIds: string[]
  categories: string[]
  t2Today: number | null
  limit: number | null
  peakT2: number
  tailProbability: number | null
  /** Core members that had not individually reached a sustained deviation when the pattern was detected. */
  membersBelowOwnLimitAtDetection: number
  /** Days between pattern detection and the first individual sustained deviation among core members (positive = pattern came first). */
  leadDays: number | null
  completeness: number
  strength: EvidenceStrength
}

// --------------------------------------------------------------- relationships

export type RelationshipStatus = 'supported' | 'not-established' | 'insufficient-data'

export interface LagResult {
  /** Positive: the first indicator's fluctuation precedes the second's by this many days. */
  lag: number
  rho: number
  n: number
  nEffective: number
  pValue: number
}

export interface RelationshipResult {
  id: string
  /** Canonical pair, in dataset indicator order. */
  a: string
  b: string
  day: number
  status: RelationshipStatus
  /** When supported: whose fluctuations come first. Equal to `a`/`b` order with lag 0 when simultaneous. */
  leader: string
  follower: string
  lagDays: number
  rho: number
  nPairs: number
  nEffective: number
  /** p-value at the best lag, corrected for the number of lags examined. */
  pLagCorrected: number
  /** Benjamini–Hochberg q-value across all pairs tested that day. */
  qValue: number
  /** Whether the association has the same sign in both halves of the record. */
  consistentAcrossHalves: boolean
  lags: LagResult[]
  /** Descriptive only: days on which both indicators were shifted from baseline. */
  overlapDays: number
  overlapStart: number | null
  overlapEnd: number | null
  onsetA: number | null
  onsetB: number | null
  /** Why the relationship is not supported, when it is not. */
  reason: string
  explanation: string
  limitations: string[]
}

// ---------------------------------------------------------------- response

export type ResponseClassification =
  | 'moved-toward-baseline'
  | 'moved-away-from-baseline'
  | 'no-clear-change'
  | 'near-baseline-before'
  | 'insufficient-data'

export interface ResponseIndicatorResult {
  indicatorId: string
  isTarget: boolean
  nPre: number
  nPost: number
  expectedPre: number
  expectedPost: number
  medianPre: number | null
  medianPost: number | null
  baselineMedian: number | null
  /** Distance of the window median from baseline, in robust-SD units. */
  zPre: number | null
  zPost: number | null
  /** |zPre| − |zPost|: positive means closer to baseline afterwards. */
  distanceChange: number | null
  /** Hodges–Lehmann estimate of the post − pre shift, in measurement units. */
  shiftEstimate: number | null
  /** Two-sided Mann–Whitney p-value for pre vs post. */
  pValue: number | null
  slopePrePerWeek: number | null
  slopePostPerWeek: number | null
  /** True when the pre-action window was already trending toward baseline. */
  preTrendTowardBaseline: boolean
  classification: ResponseClassification
}

export type ResponseStatus = 'awaiting-data' | 'limited-data' | 'evaluated'

export interface ResponseEvaluation {
  actionId: string
  action: RecordedAction
  asOfDay: number
  status: ResponseStatus
  preWindow: [number, number]
  postWindow: [number, number]
  postDaysElapsed: number
  postDaysPlanned: number
  indicators: ResponseIndicatorResult[]
  targetsTowardBaseline: number
  targetsEvaluated: number
  othersChanged: string[]
  confounders: { kind: 'event' | 'action' | 'pre-trend' | 'data-gap'; day: number; label: string; detail: string }[]
  summary: string
  limitations: string[]
}

// ----------------------------------------------------------------- insights

export type InsightKind =
  | 'normal-variation'
  | 'unusual-change'
  | 'gradual-trend'
  | 'sustained-deviation'
  | 'multivariable-pattern'
  | 'insufficient-evidence'
  | 'response-evaluation'

export interface InsightIndicator {
  indicatorId: string
  label: string
  unit: string
  value: number | null
  recentMedian: number | null
  baselineMedian: number | null
  baselineScale: number | null
  z: number | null
  shift: number | null
  percentChange: number | null
  direction: 'above' | 'below' | 'none'
  status: IndicatorStatus
}

export interface InsightCalculation {
  label: string
  value: string
  detail: string
}

export interface Insight {
  id: string
  kind: InsightKind
  title: string
  narrative: string
  indicators: InsightIndicator[]
  dateRange: { startDay: number; endDay: number | null }
  active: boolean
  calculations: InsightCalculation[]
  completeness: { observed: number; expected: number; fraction: number }
  evidence: {
    /** Strength of the statistical evidence. This is not medical certainty. */
    strength: EvidenceStrength | 'not-applicable'
    statement: string
  }
  limitations: string[]
  reviewSteps: string[]
  provenance: 'statistical-estimate'
}
