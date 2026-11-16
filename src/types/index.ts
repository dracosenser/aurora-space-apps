// ---------------------------------------------------------------------------
// AURORA domain types. The data layer (src/data, src/lib) is UI-independent.
// ---------------------------------------------------------------------------

export type IndicatorCategory =
  | 'cardiovascular'
  | 'sleep'
  | 'physical'
  | 'radiation'
  | 'behavioral'

export type IndicatorKey =
  | 'restingHR'
  | 'hrv'
  | 'systolicBP'
  | 'diastolicBP'
  | 'sleepDuration'
  | 'sleepConsistency'
  | 'sleepQuality'
  | 'exerciseMinutes'
  | 'muscleStrength'
  | 'boneDensity'
  | 'radiationDaily'
  | 'radiationCumulative'
  | 'stress'
  | 'mood'
  | 'fatigue'

export interface IndicatorMeta {
  key: IndicatorKey
  label: string
  shortLabel: string
  unit: string
  category: IndicatorCategory
  /** Direction that is generally considered concerning. */
  worseWhen: 'higher' | 'lower' | 'either'
  description: string
  decimals: number
  color: string
}

/** One simulated day of health indicators for one astronaut. */
export interface DailyRecord {
  day: number
  astronautId: string
  restingHR: number
  hrv: number
  systolicBP: number
  diastolicBP: number
  sleepDuration: number
  sleepConsistency: number
  sleepQuality: number
  exerciseMinutes: number
  muscleStrength: number
  boneDensity: number
  radiationDaily: number
  radiationCumulative: number
  stress: number
  mood: number
  fatigue: number
}

export interface Astronaut {
  id: string
  name: string
  callsign: string
  role: string
  age: number
  background: string
  color: string
  initials: string
  /** Pre-flight baselines used by the synthetic generator and the UI. */
  baseline: {
    restingHR: number
    hrv: number
    systolicBP: number
    diastolicBP: number
    sleepDuration: number
    exerciseMinutes: number
  }
}

export type EventType =
  | 'milestone'
  | 'radiation'
  | 'systems'
  | 'operations'
  | 'medical'
  | 'communications'
  | 'environment'

export interface MissionEvent {
  id: string
  day: number
  endDay?: number
  title: string
  type: EventType
  description: string
  severity: 'info' | 'watch' | 'caution'
}

export interface MissionPhase {
  id: string
  name: string
  startDay: number
  endDay: number
  gravity: number
  description: string
}

export interface Mission {
  name: string
  designation: string
  description: string
  launchDate: string
  totalDays: number
  currentDay: number
  destination: string
  phases: MissionPhase[]
}

export type AlertSeverity = 'info' | 'watch' | 'caution'

export interface AlertStat {
  indicator: IndicatorKey
  baseline: number
  recent: number
  z: number
}

export interface Alert {
  id: string
  ruleId: string
  ruleName: string
  title: string
  astronautIds: string[]
  startDay: number
  endDay: number
  active: boolean
  severity: AlertSeverity
  indicators: IndicatorKey[]
  whatChanged: string
  why: string
  method: string
  confidence: number
  confidenceRationale: string
  review: string[]
  stats: AlertStat[]
}

export type RadiationScenario = 'nominal' | 'solar-minimum' | 'spe-series' | 'enhanced-shielding'

export interface ScenarioParams {
  durationDays: number
  sleepDisruption: number
  exerciseSessionsPerWeek: number
  radiationScenario: RadiationScenario
  stressLevel: number
}

export interface ScenarioPoint {
  day: number
  muscleStrength: number
  boneDensity: number
  sleepQuality: number
  restingHR: number
  fatigue: number
  radiationCumulative: number
  readiness: number
}

export interface ScenarioResult {
  params: ScenarioParams
  series: ScenarioPoint[]
  final: ScenarioPoint
}

export interface ScenarioPreset {
  id: string
  name: string
  tagline: string
  description: string
  params: ScenarioParams
}

export interface SourceEntry {
  id: string
  name: string
  organization: string
  url: string
  description: string
  represents: string
  limitations: string
  usedFor: string
  kind: 'dataset' | 'research' | 'program' | 'standard' | 'api'
}

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  reasoning?: string[]
  facts?: string[]
  hypotheses?: string[]
  suggestions?: string[]
  timestamp: number
}

export type PageId =
  | 'mission-control'
  | 'self-check'
  | 'signal-veil'
  | 'flight-deck'
  | 'workbench'
  | 'crew-health'
  | 'early-warning'
  | 'simulator'
  | 'assistant'
  | 'sources'
  | 'presentation'
